/**
 * @description Controller for the upload LWC.
 *              Handles bulk file upload, tracks submission progress, and logs diagnostics.
 * @group       AI Navigator - LWC Controllers
 */
public with sharing class UploadController {

    private static final Integer DAILY_LIMIT = 5;

    @AuraEnabled(cacheable=true)
    public static Map<String, List<Map<String, String>>> getPicklistOptions() {
        try {
            Map<String, List<Map<String, String>>> result = new Map<String, List<Map<String, String>>>();

            // 1. Describe Stage_List__c
            List<Map<String, String>> stageOpts = new List<Map<String, String>>();
            Schema.DescribeFieldResult stageDescribe = AI_Navigator_Company__c.Stage_List__c.getDescribe();
            for (Schema.PicklistEntry ple : stageDescribe.getPicklistValues()) {
                if (ple.isActive()) {
                    stageOpts.add(new Map<String, String>{
                        'label' => ple.getLabel(),
                        'value' => ple.getValue()
                    });
                }
            }
            result.put('stageOptions', stageOpts);

            // 2. Describe Client_Type_List__c
            List<Map<String, String>> clientTypeOpts = new List<Map<String, String>>();
            Schema.DescribeFieldResult clientTypeDescribe = AI_Navigator_Company__c.Client_Type_List__c.getDescribe();
            for (Schema.PicklistEntry ple : clientTypeDescribe.getPicklistValues()) {
                if (ple.isActive()) {
                    clientTypeOpts.add(new Map<String, String>{
                        'label' => ple.getLabel(),
                        'value' => ple.getValue()
                    });
                }
            }
            result.put('clientTypeOptions', clientTypeOpts);

            return result;
        } catch (Exception e) {
            logError(null, 'getPicklistOptions', e.getMessage() + '\n' + e.getStackTraceString(), null);
            AuraHandledException ahe = new AuraHandledException('Error loading picklists: ' + e.getMessage());
            ahe.setMessage('Error loading picklists: ' + e.getMessage());
            throw ahe;
        }
    }

    @AuraEnabled(cacheable=true)
    public static String getUploadSettings() {
        try {
            Integer usedToday = getTodayUploadCount();
            Integer remaining = Math.max(0, DAILY_LIMIT - usedToday);

            return JSON.serialize(new Map<String, Object>{
                'dailyLimit'       => DAILY_LIMIT,
                'usedToday'        => usedToday,
                'remaining'        => remaining,
                'templateCsvUrl'   => '/resource/Company_Upload_Template_CSV',
                'templateXlsxUrl'  => '/resource/Company_Upload_Template_XLSX',
                'templateXlsUrl'   => '/resource/Company_Upload_Template_XLS'
            });
        } catch (Exception e) {
            logError(null, 'getUploadSettings', e.getMessage() + '\n' + e.getStackTraceString(), null);
            AuraHandledException ahe = new AuraHandledException('Error loading settings: ' + e.getMessage());
            ahe.setMessage('Error loading settings: ' + e.getMessage());
            throw ahe;
        }
    }

    @AuraEnabled(cacheable=false)
    public static String getPreviousSubmissions() {
        try {
            List<AI_Navigator_Submission__c> subs = [
                SELECT Id, Submission_Id__c, File_Name__c, Status__c,
                       Submitted_At__c, Submitted_By__c, Total_Companies__c,
                       Processed_Companies__c, Failed_Companies__c
                FROM AI_Navigator_Submission__c
                WHERE Submitted_By__c = :UserInfo.getUserId()
                ORDER BY Submitted_At__c DESC
                LIMIT 50
            ];

            List<Map<String, Object>> result = new List<Map<String, Object>>();
            for (AI_Navigator_Submission__c s : subs) {
                result.add(new Map<String, Object>{
                    'submissionId' => s.Submission_Id__c,
                    'recordId'     => s.Id,
                    'fileName'     => s.File_Name__c,
                    'status'       => s.Status__c != null ? s.Status__c.toLowerCase() : 'completed',
                    'submittedAt'  => String.valueOf(s.Submitted_At__c),
                    'total'        => s.Total_Companies__c,
                    'processed'    => s.Processed_Companies__c,
                    'failed'       => s.Failed_Companies__c
                });
            }
            return JSON.serialize(result);
        } catch (Exception e) {
            logError(null, 'getPreviousSubmissions', e.getMessage() + '\n' + e.getStackTraceString(), null);
            AuraHandledException ahe = new AuraHandledException('Error loading submissions: ' + e.getMessage());
            ahe.setMessage('Error loading submissions: ' + e.getMessage());
            throw ahe;
        }
    }

    @AuraEnabled
    public static String uploadFile(
        String fileName,
        String base64Data,
        String defaultStage,
        String defaultClientType
    ) {
        String correlationId = null;
        String submissionId  = null;
        Map<String, Object> payload = null;

        try {
            System.debug(LoggingLevel.INFO, '[AI_NAVIGATOR_UPLOAD] Starting upload for file: ' + fileName);

            Integer usedToday = getTodayUploadCount();
            if (usedToday >= DAILY_LIMIT) {
                String limitMsg = 'Daily upload limit of ' + DAILY_LIMIT + ' reached. Try again tomorrow.';
                AuraHandledException ahe = new AuraHandledException(limitMsg);
                ahe.setMessage(limitMsg);
                throw ahe;
            }

            correlationId = AiNavigatorEventService.generateCorrelationId();
            submissionId  = correlationId;
            Integer fileSize = (Integer)(base64Data.length() * 0.75);

            // 1. Extract companies from file content
            List<AI_Navigator_Company__c> companiesToInsert = new List<AI_Navigator_Company__c>();
            Id currentUserId = UserInfo.getUserId();

            List<Map<String, String>> parsedRows = parseFileContent(base64Data);
            System.debug(LoggingLevel.INFO, '[AI_NAVIGATOR_UPLOAD] Parsed rows count: ' + parsedRows.size());

            for (Map<String, String> row : parsedRows) {
                String compName = row.get('Name');
                String compUrl  = row.get('Website');

                // Skip blank rows
                if (String.isBlank(compName) && String.isBlank(compUrl)) {
                    continue;
                }

                String rowStage = String.isNotBlank(row.get('Stage')) ? row.get('Stage') : defaultStage;
                String rowClientType = String.isNotBlank(row.get('ClientType')) ? row.get('ClientType') : defaultClientType;

                companiesToInsert.add(new AI_Navigator_Company__c(
                    Name                = compName,
                    Website__c          = compUrl,
                    City__c             = row.get('City'),
                    State__c            = row.get('State'),
                    Stage_List__c       = rowStage,
                    Client_Type_List__c = rowClientType,
                    Status__c           = 'pending',
                    Correlation_Id__c   = correlationId,
                    Is_Hidden__c        = false,
                    OwnerId             = currentUserId
                ));
            }

            // Guard: Azure requires at least 1 company
            if (companiesToInsert.isEmpty()) {
                String emptyMsg = 'No company records found in "' + fileName + '". ' +
                    'Please ensure the file has columns "Company Name" and "Company URL". ' +
                    'For Excel files, please save or export your spreadsheet as CSV (.csv) before uploading.';
                
                logError(submissionId, 'uploadFile:Validation', emptyMsg, null);
                AuraHandledException ahe = new AuraHandledException(emptyMsg);
                ahe.setMessage(emptyMsg);
                throw ahe;
            }

            insert companiesToInsert;
            System.debug(LoggingLevel.INFO, '[AI_NAVIGATOR_UPLOAD] Inserted ' + companiesToInsert.size() + ' company records.');

            // 2. Create Submission record
            AI_Navigator_Submission__c sub = new AI_Navigator_Submission__c(
                Submission_Id__c       = submissionId,
                File_Name__c           = fileName,
                Status__c              = 'processing',
                Submitted_By__c        = currentUserId,
                Submitted_At__c        = DateTime.now(),
                Total_Companies__c     = companiesToInsert.size(),
                Processed_Companies__c = 0,
                Failed_Companies__c    = 0
            );
            insert sub;

            // 3. Build payload for Azure callout
            List<Map<String, Object>> companyList = new List<Map<String, Object>>();
            for (AI_Navigator_Company__c c : companiesToInsert) {
                companyList.add(new Map<String, Object>{
                    'salesforceId' => c.Id,
                    'name'         => c.Name,
                    'website'      => c.Website__c,
                    'city'         => c.City__c,
                    'state'        => c.State__c,
                    'stage'        => c.Stage_List__c,
                    'clientType'   => c.Client_Type_List__c
                });
            }

            payload = new Map<String, Object>{
                'fileName'     => fileName,
                'fileContent'  => base64Data,
                'submissionId' => submissionId,
                'companies'    => companyList,
                'stage'        => defaultStage,
                'clientType'   => defaultClientType,
                'fileSize'     => fileSize,
                'submittedBy'  => currentUserId,
                'submittedAt'  => String.valueOf(DateTime.now())
            };

            // 4. Enqueue Azure Callout Job
            try {
                System.enqueueJob(new AzureUploadCompanyCallout(
                    sub.Id,
                    JSON.serialize(payload),
                    correlationId
                ));
            } catch (Exception calloutEx) {
                System.debug(LoggingLevel.ERROR, '[AI_NAVIGATOR_UPLOAD] Callout queue error: ' + calloutEx.getMessage());
                logError(submissionId, 'AzureUploadCompanyCallout Queue', calloutEx.getMessage() + '\n' + calloutEx.getStackTraceString(), JSON.serialize(payload));
            }

            // 5. Return success
            Integer newUsedToday = usedToday + 1;
            return JSON.serialize(new Map<String, Object>{
                'success'        => true,
                'message'        => 'File uploaded successfully. Processing ' + companiesToInsert.size() + ' companies.',
                'submissionId'   => submissionId,
                'recordId'       => sub.Id,
                'fileName'       => fileName,
                'fileSize'       => fileSize,
                'totalCompanies' => companiesToInsert.size(),
                'correlationId'  => correlationId,
                'dailyLimit'     => DAILY_LIMIT,
                'usedToday'      => newUsedToday,
                'remaining'      => Math.max(0, DAILY_LIMIT - newUsedToday)
            });

        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, '[AI_NAVIGATOR_UPLOAD] Upload error: ' + e.getMessage());
            logError(submissionId, 'uploadFile', e.getMessage() + '\n' + e.getStackTraceString(), null);
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage(e.getMessage());
            throw ahe;
        }
    }

    private static Integer getTodayUploadCount() {
        DateTime startOfDay = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        return [
            SELECT COUNT()
            FROM AI_Navigator_Submission__c
            WHERE Submitted_By__c = :UserInfo.getUserId()
            AND   Submitted_At__c >= :startOfDay
        ];
    }

    private static final Map<String, String> HEADER_MAP = new Map<String, String>{
        'company name' => 'Name',
        'name'         => 'Name',
        'company url'  => 'Website',
        'website'      => 'Website',
        'url'          => 'Website',
        'city'         => 'City',
        'state'        => 'State',
        'stage'        => 'Stage',
        'client type'  => 'ClientType',
        'clienttype'   => 'ClientType'
    };

    /**
     * @description Parses rows from CSV, TSV, or text streams.
     */
    private static List<Map<String, String>> parseFileContent(String base64Data) {
        List<Map<String, String>> rows = new List<Map<String, String>>();
        try {
            if (base64Data.contains(',')) {
                base64Data = base64Data.substringAfter(',');
            }

            Blob fileBlob = EncodingUtil.base64Decode(base64Data);
            String content = fileBlob.toString();

            // Detect delimiter (comma, tab, semicolon)
            String delimiter = ',';
            if (content.contains('\t') && !content.contains(',')) {
                delimiter = '\t';
            } else if (content.contains(';') && !content.contains(',')) {
                delimiter = ';';
            }

            List<String> lines = content.split('\n');
            if (lines.isEmpty()) return rows;

            List<String> headers = new List<String>();
            for (String h : lines[0].replace('\r', '').split(delimiter)) {
                String cleanHeader = h.trim().replace('"', '');
                String normalized = HEADER_MAP.get(cleanHeader.toLowerCase());
                headers.add(normalized != null ? normalized : cleanHeader);
            }

            for (Integer i = 1; i < lines.size(); i++) {
                String line = lines[i].replace('\r', '').trim();
                if (String.isBlank(line)) continue;

                List<String> values = line.split(delimiter);
                Map<String, String> row = new Map<String, String>();
                for (Integer j = 0; j < headers.size(); j++) {
                    String val = j < values.size() ? values[j].trim().replace('"', '') : '';
                    row.put(headers[j], val);
                }
                rows.add(row);
            }
        } catch (StringException se) {
            System.debug(LoggingLevel.WARN, '[AI_NAVIGATOR_UPLOAD] Binary file stream detected: ' + se.getMessage());
        } catch (Exception ex) {
            System.debug(LoggingLevel.WARN, '[AI_NAVIGATOR_UPLOAD] File parse warning: ' + ex.getMessage());
        }
        return rows;
    }

    /**
     * @description Helper to write persistent errors directly to AI_Navigator_Request_Log__c
     */
    private static void logError(String correlationOrSubId, String endpointOrAction, String errorMessage, String payload) {
        try {
            AI_Navigator_Request_Log__c log = new AI_Navigator_Request_Log__c(
                Endpoint_Name__c      = endpointOrAction,
                Status__c             = 'Error',
                Error_Message__c      = errorMessage,
                Request_Body__c       = payload != null && payload.length() > 3000 ? payload.substring(0, 3000) : payload,
                Request_Timestamp__c  = DateTime.now()
            );
            insert log;
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, '[AI_NAVIGATOR_UPLOAD] Failed to insert log record: ' + logEx.getMessage());
        }
    }
}
/**
 * @description Controller for the upload LWC.
 *              Handles bulk file upload and tracks submission progress.
 * @group       AI Navigator - LWC Controllers
 */
public with sharing class UploadController {

    private static final Integer DAILY_LIMIT = 5;

    @AuraEnabled(cacheable=true)
    public static String getUploadSettings() {
        try {
            Integer usedToday = getTodayUploadCount();
            Integer remaining = Math.max(0, DAILY_LIMIT - usedToday);

            return JSON.serialize(new Map<String, Object>{
                'dailyLimit'       => DAILY_LIMIT,
                'usedToday'        => usedToday,
                'remaining'        => remaining,
                'templateCsvUrl'   => '/resource/UploadTemplateCSV',
                'templateXlsxUrl'  => '/resource/UploadTemplateXLSX',
                'templateXlsUrl'   => '/resource/UploadTemplateXLS'
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error loading upload settings: ' + e.getMessage());
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
            throw new AuraHandledException('Error loading submissions: ' + e.getMessage());
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
            Integer usedToday = getTodayUploadCount();
            if (usedToday >= DAILY_LIMIT) {
                throw new AuraHandledException(
                    'Daily upload limit of ' + DAILY_LIMIT + ' reached. Try again tomorrow.'
                );
            }

            correlationId = AiNavigatorEventService.generateCorrelationId();
            submissionId  = correlationId;
            Integer fileSize = (Integer)(base64Data.length() * 0.75);

            // 1. Parse CSV rows
            List<AI_Navigator_Company__c> companiesToInsert = new List<AI_Navigator_Company__c>();
            List<Map<String, String>> parsedRows = parseCsv(base64Data);
            Id currentUserId = UserInfo.getUserId();

            for (Map<String, String> row : parsedRows) {
                String rowStage = String.isNotBlank(row.get('Stage')) ? row.get('Stage') : defaultStage;
                String rowClientType = String.isNotBlank(row.get('ClientType')) ? row.get('ClientType') : defaultClientType;

                companiesToInsert.add(new AI_Navigator_Company__c(
                    Name                = row.get('Name'),
                    Website__c          = row.get('Website'),
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

            if (!companiesToInsert.isEmpty()) {
                insert companiesToInsert;
            }

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

            // 3. Build payload
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
                System.debug(LoggingLevel.WARN, 'Callout queue warning: ' + calloutEx.getMessage());
            }

            // 5. Return success
            Integer newUsedToday = usedToday + 1;
            return JSON.serialize(new Map<String, Object>{
                'success'        => true,
                'message'        => 'File uploaded successfully. Processing will start shortly.',
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

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'UploadController error: ' + e.getMessage());
            throw new AuraHandledException('Error during upload: ' + e.getMessage());
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

    private static List<Map<String, String>> parseCsv(String base64Data) {
        if (base64Data.contains(',')) {
            base64Data = base64Data.substringAfter(',');
        }

        String csvContent = EncodingUtil.base64Decode(base64Data).toString();
        List<Map<String, String>> rows = new List<Map<String, String>>();
        List<String> lines = csvContent.split('\n');

        if (lines.isEmpty()) return rows;

        List<String> headers = new List<String>();
        for (String h : lines[0].replace('\r', '').split(',')) {
            String normalized = HEADER_MAP.get(h.trim().toLowerCase());
            headers.add(normalized != null ? normalized : h.trim());
        }

        for (Integer i = 1; i < lines.size(); i++) {
            String line = lines[i].replace('\r', '').trim();
            if (String.isBlank(line)) continue;

            List<String> values = line.split(',');
            Map<String, String> row = new Map<String, String>();
            for (Integer j = 0; j < headers.size(); j++) {
                row.put(headers[j], j < values.size() ? values[j].trim() : '');
            }
            rows.add(row);
        }
        return rows;
    }
}
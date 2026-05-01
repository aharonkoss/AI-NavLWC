/**
 * @description Controller for the upload LWC.
 *              Handles bulk file upload:
 *              1. Creates a Submission__c record (Status = processing)
 *              2. Publishes AINavigatorOutbound__e (UPLOAD) with file content
 *                 embedded in the payload per Azure UploadRequest.v1 schema
 *              3. Returns real Submission__c.Id and updated daily usage to LWC
 *
 * @group       AI Navigator - LWC Controllers
 * @last-modified 2026-04-21
 */
public with sharing class UploadController {

    // Daily upload limit per user. Configurable here until we move to Custom Settings.
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

    @AuraEnabled(cacheable=true)
    public static String getPreviousSubmissions() {
        try {
            List<Submission__c> subs = [
                SELECT Id, Submission_Id__c, File_Name__c, Status__c,
                       Submitted_At__c, Submitted_By__c, Total_Companies__c,
                       Processed_Companies__c, Failed_Companies__c
                FROM Submission__c
                WHERE Submitted_By__c = :UserInfo.getUserId()
                ORDER BY Submitted_At__c DESC
                LIMIT 50
            ];

            List<Map<String, Object>> result = new List<Map<String, Object>>();
            for (Submission__c s : subs) {
                result.add(new Map<String, Object>{
                    'submissionId' => s.Submission_Id__c,
                    'recordId'     => s.Id,
                    'fileName'     => s.File_Name__c,
                    'status'       => s.Status__c,
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
        String correlationId  = null;
        String submissionId   = null;
        Map<String, Object> payload = null;

        try {
            // ── Guard: daily limit check ────────────────────────────────────
            Integer usedToday = getTodayUploadCount();
            if (usedToday >= DAILY_LIMIT) {
                throw new AuraHandledException(
                    'Daily upload limit of ' + DAILY_LIMIT + ' reached. Try again tomorrow.'
                );
            }

            // ── 1. Generate IDs ─────────────────────────────────────────────
            correlationId = AiNavigatorEventService.generateCorrelationId();
            submissionId  = correlationId;

            // ── 2. Calculate file size from base64 ──────────────────────────
            Integer fileSize = (Integer)(base64Data.length() * 0.75);

            // ── 3. Create Submission__c record ──────────────────────────────
            Submission__c sub = new Submission__c(
                Submission_Id__c = submissionId,
                File_Name__c     = fileName,
                Status__c        = 'processing',
                Submitted_By__c  = UserInfo.getUserId(),
                Submitted_At__c  = DateTime.now()
            );
            insert sub;
        // ── 3b. Parse CSV and pre-create Company__c records ─────────────────
        List<Company__c> companiesToInsert = new List<Company__c>();
        List<Map<String, String>> parsedRows = parseCsv(base64Data);

        for (Map<String, String> row : parsedRows) {
            companiesToInsert.add(new Company__c(
                Name             = row.get('Name'),
                Website__c       = row.get('Website'),
                City__c          = row.get('City'),
                State__c         = row.get('State'),
                Stage__c         = String.isNotBlank(row.get('Stage'))      ? row.get('Stage')      : defaultStage,
                Client_Type__c   = String.isNotBlank(row.get('ClientType')) ? row.get('ClientType') : defaultClientType,
                Status__c        = 'pending',
                Correlation_Id__c = correlationId
            ));
        }

        if (!companiesToInsert.isEmpty()) {
            insert companiesToInsert;
        }

        // ── 3c. Build company list WITH real SF IDs for the payload ──────────
        List<Map<String, Object>> companyList = new List<Map<String, Object>>();
        for (Company__c c : companiesToInsert) {
            companyList.add(new Map<String, Object>{
                'salesforceId' => c.Id,          // ← Azure echoes this back in callbacks
                'name'         => c.Name,
                'website'      => c.Website__c,
                'city'         => c.City__c,
                'state'        => c.State__c,
                'stage'        => c.Stage__c,
                'clientType'   => c.Client_Type__c
            });
        }         

            // ── 4. Build payload ─────────────────────────────────────────────
            payload = new Map<String, Object>{
                'fileName'     => fileName,
                'fileContent'  => base64Data,
                'submissionId' => submissionId,
                'companies'     => companyList,      // ← ADD THIS — real SF IDs included
                'stage'        => defaultStage,
                'clientType'   => defaultClientType,
                'fileSize'     => fileSize,
                'submittedBy'  => UserInfo.getUserId(),
                'submittedAt'  => String.valueOf(DateTime.now())
            };

            // ── 5. Publish outbound Platform Event ──────────────────────────
            AiNavigatorEventService.publish('UPLOAD', 'UploadRequest.v1', payload, correlationId);

            // ── 6. Log the outbound event (SUCCESS) ──────────────────────────
            writeLog('PLATFORM_EVENT', 'UploadController.uploadFile',
                    JSON.serialize(payload), null, 'Success', 202,       // ← Integer 202
                    correlationId, 'submissionId=' + submissionId + ' file=' + fileName);

            // ── 7. Return to LWC ─────────────────────────────────────────────
            Integer newUsedToday = usedToday + 1;
            return JSON.serialize(new Map<String, Object>{
                'success'       => true,
                'message'       => 'File uploaded successfully. Processing will start shortly.',
                'submissionId'  => submissionId,
                'recordId'      => sub.Id,
                'fileName'      => fileName,
                'fileSize'      => fileSize,
                'correlationId' => correlationId,
                'dailyLimit'    => DAILY_LIMIT,
                'usedToday'     => newUsedToday,
                'remaining'     => Math.max(0, DAILY_LIMIT - newUsedToday)
            });

        } catch (DmlException dmlEx) {
            System.debug(LoggingLevel.ERROR, 'UploadController DML error: ' + dmlEx.getMessage());
            writeLog('PLATFORM_EVENT', 'UploadController.uploadFile',
                payload != null ? JSON.serialize(payload) : null,
                null, 'Failed', 500,                                 // ← Integer 500
                correlationId, 'DML ERROR: ' + dmlEx.getDmlMessage(0));
            throw new AuraHandledException(
                'Could not save the submission record. ' + dmlEx.getDmlMessage(0)
            );

        } catch (AuraHandledException ahe) {
            // Daily limit or validation — log it then re-throw
           writeLog('PLATFORM_EVENT', 'UploadController.uploadFile',
                null, null, 'Failed', 400,                           // ← Integer 400
                correlationId, 'VALIDATION: ' + ahe.getMessage());
            throw ahe;

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'UploadController error: ' + e.getMessage());
            writeLog('PLATFORM_EVENT', 'UploadController.uploadFile',
                payload != null ? JSON.serialize(payload) : null,
                null, 'Failed', 500,                                 // ← Integer 500
                correlationId, 'EXCEPTION: ' + e.getMessage());
            throw new AuraHandledException('An unexpected error occurred. Please try again.');
        }
    }

    // ── Private log helper ───────────────────────────────────────────────────────
   private static void writeLog(
    String httpMethod,
    String endpointName,
    String requestBody,
    String responseBody,
    String status,
    Integer httpStatusCode,             // ← was String, now Integer
    String correlationId,
    String errorMessage
    ) {
        try {
            if (requestBody != null) {
                Map<String, Object> bodyMap = (Map<String, Object>) JSON.deserializeUntyped(requestBody);
                bodyMap.remove('fileContent');
                requestBody = JSON.serialize(bodyMap);
            }

            if (requestBody != null && requestBody.length() > 32000) {
                requestBody = requestBody.substring(0, 32000) + '...[TRUNCATED]';
            }

            insert new Azure_Request_Log__c(
                HTTP_Method__c      = httpMethod,
                Endpoint_Name__c    = endpointName,
                Request_Body__c     = requestBody,
                Response_Body__c    = responseBody,
                Status__c           = 'Success',
                HTTP_Status_Code__c = httpStatusCode,   // ← Integer, matches Number field
                Correlation_ID__c   = correlationId,
                Error_Message__c    = errorMessage
            );

        } catch (Exception logEx) {
            try {
                insert new Azure_Request_Log__c(
                    HTTP_Method__c      = httpMethod,
                    Endpoint_Name__c    = endpointName,
                    Status__c           = 'Failed',
                    HTTP_Status_Code__c = httpStatusCode,   // ← Integer here too
                    Correlation_ID__c   = correlationId,
                    Error_Message__c    = 'writeLog INSERT FAILED: ' + logEx.getMessage()
                                        + ' | Original error: ' + errorMessage
                );
            } catch (Exception fallbackEx) {
                // Last resort — only two fields, nothing that can fail
    insert new Azure_Request_Log__c(
        Status__c        = 'Failed',
        Error_Message__c = 'writeLog ALL inserts failed.'
                            + ' Final: '    + fallbackEx.getMessage()
                            + ' Fallback: ' + fallbackEx.getMessage()
                            + ' Primary: '  + fallbackEx.getMessage()
                            + ' Original: ' + errorMessage
        );
            }
        }
    }

    // ── Private Helpers ──────────────────────────────────────────────────────

        /**
         * Counts how many Submission__c records the current user has created today.
         * Used for daily limit enforcement.
         */
        private static Integer getTodayUploadCount() {
            DateTime startOfDay = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
            return [
                SELECT COUNT()
                FROM Submission__c
                WHERE Submitted_By__c = :UserInfo.getUserId()
                AND   Submitted_At__c >= :startOfDay
            ];
        }
    // Normalize header names to match row.get() keys
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

        // Parse + normalize header row
        List<String> headers = new List<String>();
        for (String h : lines[0].replace('\r', '').split(',')) {
            String normalized = HEADER_MAP.get(h.trim().toLowerCase());
            headers.add(normalized != null ? normalized : h.trim());
        }

        // Parse data rows
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
/**
 * AzureCompanyCallbackService
 *
 * Direct HTTP callback endpoint. Azure calls this to update
 * specific Company__c records with research results, Azure IDs,
 * scores, or status changes.
 *
 * Endpoint : /services/apexrest/ainavigator/v1/companies/callback
 * Method   : POST
 * Auth     : OAuth 2.0 Bearer Token (Client Credentials Flow)
 *
 * Expected payload (Single or Array):
 * {
 *   "companyId"     : "a06gK00000NYCXnQAP",   // Salesforce ID or Correlation ID
 *   "azureCompanyId": "95a4ec88-7fb2-4b4d...", // Azure UUID for this company
 *   "status"        : "completed",             // pending/processing/completed/failed
 *   "prospectScore" : 78.5,                    // optional
 *   "pdfReportUrl"  : "https://...",           // optional
 *   "correlationId" : "SF-..."                 // optional
 * }
 */
@RestResource(urlMapping='/ainavigator/v1/companies/callback')
global without sharing class AzureCompanyCallbackService {

    private static final String CORR_HEADER = 'X-Correlation-Id';

    @HttpPost
    global static void handlePost() {
        RestRequest  req = RestContext.request;
        RestResponse res = RestContext.response;

        String headerCorrelationId = '';
        String requestBody         = '';

        try {
            // ── 1. Headers ───────────────────────────────────────────────────
            headerCorrelationId = req.headers.get(CORR_HEADER);
            if (String.isBlank(headerCorrelationId)) {
                headerCorrelationId = req.headers.get('x-correlation-id');
            }
            if (String.isBlank(headerCorrelationId)) {
                headerCorrelationId = 'NO-CORR-ID-' + DateTime.now().getTime();
            }

            // ── 2. Parse request body ────────────────────────────────────────
            requestBody = req.requestBody != null ? req.requestBody.toString() : '';
            if (String.isBlank(requestBody)) {
                sendResponse(res, 400, 'error', 'Request body is required.', headerCorrelationId);
                return;
            }

            Object deserialized;
            try {
                deserialized = JSON.deserializeUntyped(requestBody);
            } catch (Exception je) {
                sendResponse(res, 400, 'error', 'Invalid JSON: ' + je.getMessage(), headerCorrelationId);
                return;
            }

            // Normalize payload into a List of Map<String, Object>
            List<Map<String, Object>> updateItems = new List<Map<String, Object>>();

            if (deserialized instanceof List<Object>) {
                for (Object item : (List<Object>) deserialized) {
                    if (item instanceof Map<String, Object>) {
                        updateItems.add((Map<String, Object>) item);
                    }
                }
            } else if (deserialized instanceof Map<String, Object>) {
                Map<String, Object> bodyMap = (Map<String, Object>) deserialized;
                if (bodyMap.containsKey('companies') && bodyMap.get('companies') instanceof List<Object>) {
                    for (Object item : (List<Object>) bodyMap.get('companies')) {
                        if (item instanceof Map<String, Object>) {
                            updateItems.add((Map<String, Object>) item);
                        }
                    }
                } else {
                    updateItems.add(bodyMap);
                }
            }

            if (updateItems.isEmpty()) {
                sendResponse(res, 400, 'error', 'No valid company update items found in payload.', headerCorrelationId);
                return;
            }

            // ── 3. Collect Company Lookup Keys ──────────────────────────────
            Set<Id> salesforceIds          = new Set<Id>();
            Set<String> correlationKeys   = new Set<String>();

            for (Map<String, Object> item : updateItems) {
                String rawKey = getStringValue(item, new List<String>{'companyId', 'salesforceId', 'id'});
                if (String.isNotBlank(rawKey)) {
                    if ((rawKey.length() == 15 || rawKey.length() == 18) && rawKey.startsWith('a06')) {
                        try {
                            salesforceIds.add((Id) rawKey);
                        } catch (Exception idEx) {
                            correlationKeys.add(rawKey);
                        }
                    } else {
                        correlationKeys.add(rawKey);
                    }
                }

                String rowCorr = getStringValue(item, new List<String>{'correlationId', 'correlation_id'});
                if (String.isNotBlank(rowCorr)) {
                    correlationKeys.add(rowCorr);
                }
            }

            // ── 4. Query Matching Companies ──────────────────────────────────
            Map<Id, AI_Navigator_Company__c> matchedById = new Map<Id, AI_Navigator_Company__c>();
            Map<String, AI_Navigator_Company__c> matchedByCorr = new Map<String, AI_Navigator_Company__c>();

            if (!salesforceIds.isEmpty()) {
                for (AI_Navigator_Company__c c : [
                    SELECT Id, Status__c, Prospect_Score__c, Scored_At__c,
                           PDF_Report_URL__c, Research_Completed_At__c,
                           Correlation_Id__c, Azure_Company_Id__c
                    FROM AI_Navigator_Company__c
                    WHERE Id IN :salesforceIds
                ]) {
                    matchedById.put(c.Id, c);
                }
            }

            if (!correlationKeys.isEmpty()) {
                for (AI_Navigator_Company__c c : [
                    SELECT Id, Status__c, Prospect_Score__c, Scored_At__c,
                           PDF_Report_URL__c, Research_Completed_At__c,
                           Correlation_Id__c, Azure_Company_Id__c
                    FROM AI_Navigator_Company__c
                    WHERE Correlation_Id__c IN :correlationKeys
                ]) {
                    matchedByCorr.put(c.Correlation_Id__c, c);
                    matchedById.put(c.Id, c);
                }
            }

            // ── 5. Apply Updates Per Company (1-to-1 Mapping) ────────────────
            List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
            Set<Id> updatedIds = new Set<Id>();

            for (Map<String, Object> item : updateItems) {
                String rawKey = getStringValue(item, new List<String>{'companyId', 'salesforceId', 'id'});
                String rowCorr = getStringValue(item, new List<String>{'correlationId', 'correlation_id'});

                AI_Navigator_Company__c company = null;
                if (String.isNotBlank(rawKey) && matchedById.containsKey(rawKey)) {
                    company = matchedById.get(rawKey);
                } else if (String.isNotBlank(rowCorr) && matchedByCorr.containsKey(rowCorr)) {
                    company = matchedByCorr.get(rowCorr);
                } else if (String.isNotBlank(rawKey) && matchedByCorr.containsKey(rawKey)) {
                    company = matchedByCorr.get(rawKey);
                }

                if (company == null || updatedIds.contains(company.Id)) {
                    continue;
                }

                // 1. Map Azure Company Id
                String azureCompId = getStringValue(item, new List<String>{'azureCompanyId', 'azure_company_id', 'azureId'});
                if (String.isNotBlank(azureCompId)) {
                    company.Azure_Company_Id__c = azureCompId;
                }

                // 2. Status
                String newStatus = getStringValue(item, new List<String>{'status', 'status__c'});
                if (String.isNotBlank(newStatus)) {
                    company.Status__c = newStatus;
                    if (newStatus.equalsIgnoreCase('completed') || newStatus.equalsIgnoreCase('failed')) {
                        company.Research_Completed_At__c = DateTime.now();
                    }
                }

                // 3. Prospect Score
                Object scoreVal = item.get('prospectScore');
                if (scoreVal == null) scoreVal = item.get('score');
                if (scoreVal != null) {
                    try {
                        company.Prospect_Score__c = Decimal.valueOf(String.valueOf(scoreVal));
                        company.Scored_At__c      = DateTime.now();
                    } catch (Exception scoreEx) {
                        System.debug(LoggingLevel.WARN, 'Invalid score value: ' + scoreVal);
                    }
                }

                // 4. PDF Report URL
                String pdfUrl = getStringValue(item, new List<String>{'pdfReportUrl', 'pdf_report_url', 'pdfUrl'});
                if (String.isNotBlank(pdfUrl)) {
                    company.PDF_Report_URL__c = pdfUrl;
                }

                // 5. Update Correlation ID only if unique one is passed in row
                if (String.isNotBlank(rowCorr)) {
                    company.Correlation_Id__c = rowCorr;
                }

                toUpdate.add(company);
                updatedIds.add(company.Id);
            }

            if (toUpdate.isEmpty()) {
                sendResponse(res, 404, 'error', 'No matching companies found to update.', headerCorrelationId);
                return;
            }

            // ── 6. DML Update ────────────────────────────────────────────────
            update toUpdate;
            System.debug(LoggingLevel.INFO, '[AzureCompanyCallbackService] Successfully updated ' + toUpdate.size() + ' companies.');

            // ── 7. Respond ───────────────────────────────────────────────────
            sendResponse(res, 200, 'success',
                'Successfully updated ' + toUpdate.size() + ' company records.', headerCorrelationId);

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'AzureCompanyCallbackService Exception: ' + e.getTypeName() +
                ': ' + e.getMessage() + ' | Line: ' + e.getLineNumber() + '\n' + e.getStackTraceString());
            
            logError(headerCorrelationId, e.getMessage() + '\n' + e.getStackTraceString(), requestBody);
            
            sendResponse(res, 500, 'error',
                'Internal Server Error: ' + e.getMessage(), headerCorrelationId);
        }
    }

    // ── Helper: Safe Key Extraction ──────────────────────────────────────────
    private static String getStringValue(Map<String, Object> mapObj, List<String> candidateKeys) {
        for (String k : candidateKeys) {
            if (mapObj.containsKey(k) && mapObj.get(k) != null) {
                String val = String.valueOf(mapObj.get(k)).trim();
                if (String.isNotBlank(val)) {
                    return val;
                }
            }
        }
        return null;
    }

    private static void sendResponse(
        RestResponse res,
        Integer      statusCode,
        String       status,
        String       message,
        String       correlationId
    ) {
        Map<String, Object> body = new Map<String, Object>{
            'status'        => status,
            'message'       => message,
            'correlationId' => correlationId,
            'timestamp'     => String.valueOf(DateTime.now())
        };
        res.statusCode   = statusCode;
        res.responseBody = Blob.valueOf(JSON.serializePretty(body));
        res.headers.put('Content-Type', 'application/json');
        res.headers.put('X-Correlation-Id', correlationId);
    }

    private static void logError(String correlationId, String errorMessage, String requestBody) {
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c       = 'POST',
                Endpoint_Name__c     = 'AzureCompanyCallbackService',
                Request_Body__c      = requestBody != null && requestBody.length() > 3000 ? requestBody.substring(0, 3000) : requestBody,
                Status__c            = 'Error',
                HTTP_Status_Code__c  = 500,
                Correlation_ID__c    = correlationId,
                Error_Message__c     = errorMessage != null && errorMessage.length() > 3000 ? errorMessage.substring(0, 3000) : errorMessage,
                Request_Timestamp__c = DateTime.now()
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'AzureCompanyCallbackService: Log write failed: ' + logEx.getMessage());
        }
    }
}
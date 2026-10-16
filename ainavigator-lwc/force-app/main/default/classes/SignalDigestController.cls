/**
 * @description Controller for Enhanced Signal Digest using ProspectingHttpService.
 *              Fetches digest data directly from Azure without regeneration logic.
 */
public with sharing class SignalDigestController {

    /**
     * @description Fetches the Enhanced Research Digest via ProspectingHttpService.
     * @param  salesforceCompanyId  The Salesforce Record Id (AI_Navigator_Company__c.Id)
     */
    @AuraEnabled(cacheable=false)
    public static String getEnhancedDigestData(String salesforceCompanyId) {
        String correlationId = '';
        String azureCompanyId = '';
        String endpointCalled = '';

        try {
            // ── 1. Validate Input ───────────────────────────────────────────────
            if (String.isBlank(salesforceCompanyId)) {
                return formatErrorJson('salesforceCompanyId is required.', 400, 'N/A', '', salesforceCompanyId, '');
            }

            // ── 2. Look up Company in Salesforce ────────────────────────────────
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c, Status__c
                FROM AI_Navigator_Company__c
                WHERE Id = :salesforceCompanyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                return formatErrorJson('Company not found for Id: ' + salesforceCompanyId, 404, 'N/A', '', salesforceCompanyId, '');
            }

            // If company has not completed pipeline research or lacks an Azure GUID, return not_started (legacy)
            if (companies[0].Status__c != 'completed' || String.isBlank(companies[0].Azure_Company_Id__c)) {
                return JSON.serialize(new Map<String, Object>{
                    'companyId'     => companies[0].Azure_Company_Id__c,
                    'salesforceId'  => companies[0].Id,
                    'status'        => 'not_started',
                    'correlationId' => companies[0].Correlation_Id__c
                });
            }

            azureCompanyId = companies[0].Azure_Company_Id__c;
            correlationId = String.isNotBlank(companies[0].Correlation_Id__c) 
                ? companies[0].Correlation_Id__c 
                : generateCorrelationId();

            String userId = UserInfo.getUserId();

            // ── 3. Build Request via ProspectingHttpService ─────────────────────
            String path = '/prospecting/v1/user/companies/' +
                          EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') +
                          '/enhanced-research-digest';

            HttpRequest req = ProspectingHttpService.buildRequest('GET', path, correlationId, userId);
            endpointCalled = req.getEndpoint();

            HttpResponse res = new Http().send(req);

            // ── 4. Evaluate Response ────────────────────────────────────────────
            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return res.getBody();
            } else if (res.getStatusCode() == 404) {
                // Not generated in Azure (legacy company)
                return JSON.serialize(new Map<String, Object>{
                    'companyId'     => azureCompanyId,
                    'salesforceId'  => companies[0].Id,
                    'status'        => 'not_started',
                    'correlationId' => correlationId
                });
            } else {
                String errorMsg = ProspectingHttpService.parseErrorResponse(res);
                logError('SignalDigestController.getEnhancedDigestData', 'GET', correlationId, errorMsg);
                return formatErrorJson(errorMsg, res.getStatusCode(), endpointCalled, res.getBody(), salesforceCompanyId, azureCompanyId, correlationId);
            }

        } catch (Exception e) {
            String fullErr = e.getMessage() + '\n' + e.getStackTraceString();
            logError('SignalDigestController.getEnhancedDigestData', 'GET', correlationId, fullErr);
            return formatErrorJson('Apex Exception: ' + e.getMessage(), 500, endpointCalled, fullErr, salesforceCompanyId, azureCompanyId, correlationId);
        }
    }

    // ── Diagnostic Helpers ──────────────────────────────────────────────────
    private static String formatErrorJson(String message, Integer statusCode, String endpoint, String responseBody, String sfId, String corrId) {
        return formatErrorJson(message, statusCode, endpoint, responseBody, sfId, '', corrId);
    }

    private static String formatErrorJson(String message, Integer statusCode, String endpoint, String responseBody, String sfId, String azureId, String corrId) {
        return JSON.serialize(new Map<String, Object>{
            'isError'            => true,
            'status'             => 'error',
            'errorMessage'       => message,
            'statusCode'         => statusCode,
            'endpoint'           => endpoint,
            'responseBody'       => String.isNotBlank(responseBody) ? responseBody : '(Empty response body)',
            'salesforceId'       => sfId,
            'companyId'          => azureId,
            'correlationId'      => corrId,
            'timestamp'          => String.valueOf(Datetime.now())
        });
    }

    private static void logError(String endpointName, String httpMethod, String correlationId, String errorMessage) {
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = httpMethod,
                Endpoint_Name__c    = endpointName,
                Status__c           = 'Failed',
                Correlation_ID__c   = correlationId,
                Error_Message__c    = errorMessage != null ? errorMessage.left(32768) : null
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
        }
    }

    private static String generateCorrelationId() {
        return 'SF-' + DateTime.now().getTime() + '-' + EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 8);
    }
}
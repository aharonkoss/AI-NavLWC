/**
 * @description Apex controller that fetches company signals and signals PDF download URL directly from Azure.
 *
 * @group AI Navigator - Apex
 * @last-modified 2026-08-26
 */
public with sharing class CompanySignalsController {

    /**
     * @description Fetches signals for a company from Azure.
     * @param  salesforceCompanyId  The Salesforce Company__c.Id (15 or 18 char)
     * @return JSON string matching SignalsResponse schema
     */
    @AuraEnabled(cacheable=false)
    public static String getSignals(String salesforceCompanyId) {
        String correlationId = '';
        try {
            // ── 1. Validate input ───────────────────────────────────────────────
            if (String.isBlank(salesforceCompanyId)) {
                throw createHandledException('salesforceCompanyId is required.');
            }

            // ── 2. Look up Azure_Company_Id__c on Company__c ────────────────────
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :salesforceCompanyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                throw createHandledException('Company not found for Id: ' + salesforceCompanyId);
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;

            if (String.isBlank(azureCompanyId)) {
                throw createHandledException(
                    'This company has not been synced to Azure yet (Azure_Company_Id__c is blank).'
                );
            }

            // ── 3. Build request ────────────────────────────────────────────────
            correlationId = companies[0].Correlation_Id__c;
            String userId = UserInfo.getUserId();
            
            String path = '/v1/user/companies/' +
                          EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') +
                          '/signals-new';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            // ── 4. Handle response ──────────────────────────────────────────────
            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else if (res.getStatusCode() == 404) {
                return JSON.serialize(new Map<String, Object>{
                    'signals' => new List<Object>()
                });
            } else {
                throw createHandledException('Azure signals fetch failed (' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            logError('CompanySignalsController.getSignals', 'GET', correlationId, e.getMessage());
            throw createHandledException(e.getMessage());
        }
    }

    /**
     * @description Fetches the signals PDF SAS download URL from Azure.
     *              GET /v1/user/companies/{azureCompanyId}/signals/pdf
     * @param  salesforceCompanyId  The Salesforce Company__c.Id (15 or 18 char)
     * @return JSON string containing downloadUrl, fileName, and expiresAt
     */
    @AuraEnabled(cacheable=false)
    public static String getSignalsPdfDownloadUrl(String salesforceCompanyId) {
        String correlationId = '';
        try {
            if (String.isBlank(salesforceCompanyId)) {
                throw createHandledException('salesforceCompanyId is required.');
            }

            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :salesforceCompanyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                throw createHandledException('Company not found for Id: ' + salesforceCompanyId);
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;

            if (String.isBlank(azureCompanyId)) {
                throw createHandledException(
                    'This company has not been synced to Azure yet (Azure_Company_Id__c is blank).'
                );
            }

            correlationId = companies[0].Correlation_Id__c;
            String userId = UserInfo.getUserId();
            
            String path = '/v1/user/companies/' +
                          EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') +
                          '/signals/pdf';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                throw createHandledException('Signals PDF fetch failed (' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            logError('CompanySignalsController.getSignalsPdfDownloadUrl', 'GET', correlationId, e.getMessage());
            throw createHandledException(e.getMessage());
        }
    }

    // ── Private: Log only when an error occurs ──────────────────────────────
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

    private static AuraHandledException createHandledException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
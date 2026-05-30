/**
 * @description Apex controller that fetches company signals directly from Azure
 *              via a synchronous GET callout. Replaces the mock data in
 *              CompanyDetailController.getSignals().
 *
 *              Flow:
 *              1. Accept Salesforce Company__c.Id from LWC
 *              2. Look up Azure_Company_Id__c on Company__c
 *              3. Call GET /v1/user/companies/{azureCompanyId}/signals via AzureHttpService
 *              4. Return raw JSON string to LWC
 *
 * @group AI Navigator - Apex
 * @last-modified 2026-05-16
 */
public with sharing class CompanySignalsController {

    /**
     * @description Fetches signals for a company from Azure.
     *              Called by companyDetailSignals.js on initial load.
     * @param  salesforceCompanyId  The Salesforce Company__c.Id (15 or 18 char)
     * @return JSON string matching SignalsResponse schema from OpenAPI v2.2.2
     */
    @AuraEnabled(cacheable=false)
    public static String getSignals(String salesforceCompanyId) {

        // ── 1. Validate input ───────────────────────────────────────────────
        if (String.isBlank(salesforceCompanyId)) {
            throw new AuraHandledException('salesforceCompanyId is required.');
        }

        // ── 2. Look up Azure_Company_Id__c on Company__c ────────────────────
        List<Company__c> companies = [
            SELECT Id, Azure_Company_Id__c
            FROM Company__c
            WHERE Id = :salesforceCompanyId
            LIMIT 1
        ];

        if (companies.isEmpty()) {
            throw new AuraHandledException(
                'Company not found for Id: ' + salesforceCompanyId
            );
        }

        String azureCompanyId = companies[0].Azure_Company_Id__c;

        if (String.isBlank(azureCompanyId)) {
            throw new AuraHandledException(
                'This company has not been synced to Azure yet (Azure_Company_Id__c is blank). ' +
                'Please wait for research to complete.'
            );
        }

        // ── 3. Build correlation ID & HTTP request ──────────────────────────
        String correlationId = AiNavigatorEventService.generateCorrelationId();
        String userId        = UserInfo.getUserId();
        String path          = '/api/v1/user/companies/' +
                               EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') +
                               '/signals';

        HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
        HttpResponse res = new Http().send(req);

        // ── 4. Log the callout ──────────────────────────────────────────────
        try {
            insert new Azure_Request_Log__c(
                HTTP_Method__c      = 'GET',
                Endpoint_Name__c    = 'CompanySignalsController.getSignals',
                Response_Body__c    = res.getBody(),
                Status__c           = (res.getStatusCode() == 200) ? 'Success' : 'Failed',
                HTTP_Status_Code__c = res.getStatusCode(),
                Correlation_ID__c   = correlationId
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
        }

        // ── 5. Handle response ──────────────────────────────────────────────
        if (res.getStatusCode() == 200) {
            return res.getBody();
        } else if (res.getStatusCode() == 404) {
            // Company exists in SF but Azure has no signals yet — return empty
            return JSON.serialize(new Map<String, Object>{
                'signals' => new List<Object>()
            });
        } else {
            throw new AuraHandledException(
                'Azure signals fetch failed (' + res.getStatusCode() + '): ' +
                AzureHttpService.parseErrorResponse(res)
            );
        }
    }
}

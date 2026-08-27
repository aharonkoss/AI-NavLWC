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
        try {
            // ── 1. Validate input ───────────────────────────────────────────────
            if (String.isBlank(salesforceCompanyId)) {
                throw new AuraHandledException('salesforceCompanyId is required.');
            }

            // ── 2. Look up Azure_Company_Id__c on Company__c ────────────────────
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :salesforceCompanyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                throw new AuraHandledException('Company not found for Id: ' + salesforceCompanyId);
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;

            if (String.isBlank(azureCompanyId)) {
                throw new AuraHandledException(
                    'This company has not been synced to Azure yet (Azure_Company_Id__c is blank).'
                );
            }

            // ── 3. Build request ────────────────────────────────────────────────
            String correlationId = companies[0].Correlation_Id__c;
            String userId        = UserInfo.getUserId();
            
            String path          = '/v1/user/companies/' +
                                   EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') +
                                   '/signals-new';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            // ── 4. Log the callout ──────────────────────────────────────────────
            try {
                insert new AI_Navigator_Request_Log__c(
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
                return JSON.serialize(new Map<String, Object>{
                    'signals' => new List<Object>()
                });
            } else {
                throw new AuraHandledException('Azure signals fetch failed (' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
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
        try {
            if (String.isBlank(salesforceCompanyId)) {
                throw new AuraHandledException('salesforceCompanyId is required.');
            }

            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :salesforceCompanyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                throw new AuraHandledException('Company not found for Id: ' + salesforceCompanyId);
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;

            if (String.isBlank(azureCompanyId)) {
                throw new AuraHandledException(
                    'This company has not been synced to Azure yet (Azure_Company_Id__c is blank).'
                );
            }

            String correlationId = companies[0].Correlation_Id__c;
            String userId        = UserInfo.getUserId();
            
            String path          = '/v1/user/companies/' +
                                   EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') +
                                   '/signals/pdf';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('GET /signals/pdf').left(80),
                    HTTP_Method__c      = 'GET',
                    Endpoint_Name__c    = 'CompanySignalsController.getSignalsPdfDownloadUrl',
                    Response_Body__c    = res.getBody(),
                    Status__c           = (res.getStatusCode() == 200) ? 'Success' : 'Failed',
                    HTTP_Status_Code__c = res.getStatusCode(),
                    Correlation_ID__c   = correlationId
                );
            } catch (Exception logEx) {
                System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
            }

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                throw new AuraHandledException('Signals PDF fetch failed (' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
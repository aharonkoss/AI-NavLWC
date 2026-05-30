/**
 * @description  Company Detail Controller — fetches all research data live
 *               from Azure AI Navigator API using the Azure_Company_Id__c
 *               stored on Company__c after RESEARCH_DONE platform event fires.
 * @author       AI Navigator Platform
 * @group        AI Navigator Integration
 * @last modified on  : 05-21-2026
**/
public with sharing class CompanyDetailController {



    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG — loaded once from AI_Navigator_Config__mdt
    // ─────────────────────────────────────────────────────────────────────────
    private static final AI_Navigator_Config__mdt CONFIG =
        AI_Navigator_Config__mdt.getInstance('Dev');


    private static final String NAMED_CREDENTIAL =
        'callout:' + (CONFIG?.Named_Credential_Name__c != null
                      ? CONFIG.Named_Credential_Name__c
                      : 'AI_Navigator_Azure');


    private static final Integer CALLOUT_TIMEOUT_MS =
        CONFIG?.Callout_Timeout_Ms__c != null
        ? Integer.valueOf(CONFIG.Callout_Timeout_Ms__c)
        : 20000;


    private static final String API_VERSION = 'v1';



    // ─────────────────────────────────────────────────────────────────────────
    // Company header data
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCompany(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required.');
        }
        try {
            Company__c c = [
                SELECT Id, Name, City__c, State__c,
                       Website__c, Status__c, Stage__c,
                       Client_Type__c, Client_Id__c,
                       Research_Completed_At__c,
                       Azure_Company_Id__c, Correlation_Id__c,
                       Prospect_Score__c, PDF_Report_URL__c,
                       Error_Message__c, Industry__c
                FROM   Company__c
                WHERE  Id = :companyId
                LIMIT  1
            ];
            Map<String, Object> result = new Map<String, Object>{
                'id'             => c.Id,
                'companyId'      => c.Id,
                'azureCompanyId' => c.Azure_Company_Id__c,
                'name'           => c.Name,
                'city'           => c.City__c,
                'state'          => c.State__c,
                'website'        => c.Website__c,
                'status'         => c.Status__c,
                'stage'          => c.Stage__c,
                'clientType'     => c.Client_Type__c,
                'clientId'       => c.Client_Id__c,
                'industry'       => c.Industry__c,
                'updatedAt'      => c.Research_Completed_At__c != null
                                       ? String.valueOf(c.Research_Completed_At__c.date())
                                       : null,
                'prospectScore'  => c.Prospect_Score__c,
                'pdfReportUrl'   => c.PDF_Report_URL__c,
                'errorMessage'   => c.Error_Message__c
            };
            return JSON.serialize(result);
        } catch (QueryException e) {
            throw new AuraHandledException('Company not found: ' + companyId);
        }
    }



    // ─────────────────────────────────────────────────────────────────────────
    // All companies for dashboard navigation
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAllCompanies() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        for (Company__c c : [
            SELECT Id, Name, City__c, State__c,
                   Website__c, Status__c, Stage__c,
                   Client_Type__c, Research_Completed_At__c,
                   Azure_Company_Id__c, Prospect_Score__c,
                   Industry__c, Is_Hidden__c
            FROM   Company__c
            WHERE  Is_Hidden__c = false
            ORDER BY Research_Completed_At__c DESC NULLS LAST
            LIMIT  200
        ]) {
            result.add(new Map<String, Object>{
                'id'             => c.Id,
                'companyId'      => c.Id,
                'azureCompanyId' => c.Azure_Company_Id__c,
                'name'           => c.Name,
                'city'           => c.City__c,
                'state'          => c.State__c,
                'website'        => c.Website__c,
                'status'         => c.Status__c,
                'stage'          => c.Stage__c,
                'clientType'     => c.Client_Type__c,
                'industry'       => c.Industry__c,
                'prospectScore'  => c.Prospect_Score__c,
                'updatedAt'      => c.Research_Completed_At__c != null
                                       ? String.valueOf(c.Research_Completed_At__c.date())
                                       : null
            });
        }
        return JSON.serialize(result);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Live Updates
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getLiveUpdates(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/live-updates'),
            companyId
        );
        return handleResponse(res, 'getLiveUpdates', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Signals
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getSignals(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/signals'),
            companyId
        );
        return handleResponse(res, 'getSignals', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // AI Research
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAiResearch(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/ai-research'),
            companyId
        );
        return handleResponse(res, 'getAiResearch', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Insights
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getInsights(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/insights'),
            companyId
        );
        return handleResponse(res, 'getInsights', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Call Plan
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCallPlan(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/discovery-call-plan'),
            companyId
        );
        return handleResponse(res, 'getCallPlan', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Bundled fetch
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCompanyDetailBundle(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/detail'),
            companyId
        );
        return handleResponse(res, 'getCompanyDetailBundle', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // UCC Filings — GET /v1/user/companies/{azureCompanyId}/ucc
    //
    // Returns null on 404 (UCC_NOT_FOUND — data not yet fetched for this
    // company) so the LWC can render the "no data" empty state gracefully
    // instead of throwing a hard error. All other non-2xx codes throw.
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getUccFilings(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/ucc'),
            companyId
        );
        // 404 = UCC_NOT_FOUND — not yet fetched/available; return null so LWC
        // can show the empty-state card rather than an error message.
        if (res.getStatusCode() == 404) {
            return null;
        }
        return handleResponse(res, 'getUccFilings', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // VerticalIQ — GET /v1/user/companies/{azureCompanyId}/verticaliq
    //
    // Optional naicsCode query param lets the LWC override the NAICS code
    // (the "Change NAICS + Reload" flow in the React portal).
    //
    // Returns null on 404 (VIQ_NOT_FOUND — data not yet fetched for this
    // company) so the LWC can render the empty state gracefully instead of
    // throwing a hard error.  All other non-2xx codes throw.
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getVerticalIqData(String companyId, String naicsCode) {
        String azureId  = getAzureCompanyId(companyId);
        String endpoint = buildEndpoint('user/companies/' + azureId + '/verticaliq');
        if (String.isNotBlank(naicsCode)) {
            endpoint += '?naicsCode=' + EncodingUtil.urlEncode(naicsCode.trim(), 'UTF-8');
        }
        HttpResponse res = makeAzureGetWithTimeout(endpoint, companyId, 30000);
        // 404 = VIQ_NOT_FOUND — not yet fetched/available; return null so LWC
        // can show the empty-state card rather than an error message.
        if (res.getStatusCode() == 404) {
            return null;
        }
        return handleResponse(res, 'getVerticalIqData', companyId);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Leadership Lookup — GET /v1/user/leadership-lookup
    //
    // Calls the Perplexity + RocketReach executive lookup endpoint.
    // Uses Company__c.Name (required) and Website__c (optional) as query params.
    // Returns null on 404 so the LWC renders an empty state gracefully.
    // Uses AzureHttpService.buildRequest() for all header/auth configuration —
    // consistent with AzureManualCompanyCallout, AzureUploadCompanyCallout, etc.
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getLeadership(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required.');
        }

        // Fetch Name and Website from the Company__c record
        Company__c c;
        try {
            c = [
                SELECT Name, Website__c
                FROM   Company__c
                WHERE  Id = :companyId
                LIMIT  1
            ];
        } catch (QueryException e) {
            throw new AuraHandledException('Company record not found: ' + companyId);
        }

        if (String.isBlank(c.Name)) {
            throw new AuraHandledException('Company name is required for leadership lookup.');
        }

        // Build path: /v1/user/leadership-lookup?company=...&url=...
        String path = '/v1/user/leadership-lookup'
            + '?company=' + EncodingUtil.urlEncode(c.Name.trim(), 'UTF-8');

        if (String.isNotBlank(c.Website__c)) {
            path += '&url=' + EncodingUtil.urlEncode(c.Website__c.trim(), 'UTF-8');
        }

        // Use AzureHttpService — same pattern as AzureManualCompanyCallout,
        // AzureUploadCompanyCallout, etc. All headers/auth set automatically.
        String correlationId = AiNavigatorEventService.generateCorrelationId();

        HttpRequest req = AzureHttpService.buildRequest(
            'GET',
            path,
            correlationId,
            UserInfo.getUserId()
        );

        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (CalloutException e) {
            throw new AuraHandledException('Leadership lookup callout failed: ' + e.getMessage());
        }

        // 404 = no executives found — return null so LWC renders empty state
        if (res.getStatusCode() == 404) {
            return null;
        }

        return handleResponse(res, 'getLeadership', companyId);
    }
    /**
     * getLeadershipData
     * Calls Azure GET /v1/user/leadership-lookup and returns raw JSON.
     * Scoped to Leadership tab only — no other methods changed.
     */
        @AuraEnabled(cacheable=false)
        public static String getLeadershipData(String companyName, String companyUrl) {
            if (String.isBlank(companyName)) {
                throw new AuraHandledException('companyName is required');
            }
            try {
                String correlationId = AiNavigatorEventService.generateCorrelationId();
                String path = 'v1/user/leadership-lookup?company='
                    + EncodingUtil.urlEncode(companyName, 'UTF-8')
                    + (String.isNotBlank(companyUrl)
                        ? '&url=' + EncodingUtil.urlEncode(companyUrl, 'UTF-8')
                        : '');

                HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, UserInfo.getUserId());
                HttpResponse res = new Http().send(req);

                // Log the callout
                try {
                    insert new Azure_Request_Log__c(
                        HTTP_Method__c    = 'GET',
                        Endpoint_Name__c  = 'leadership-lookup',
                        Response_Body__c  = res.getBody(),
                        Status__c        = (res.getStatusCode() == 200) ? 'Success' : 'Failed',
                        HTTP_Status_Code__c = res.getStatusCode(),
                        Correlation_ID__c  = correlationId
                    );
                } catch (Exception logEx) {
                    System.debug(LoggingLevel.ERROR, 'getLeadershipData log failed: ' + logEx.getMessage());
                }

                if (res.getStatusCode() == 200) {
                    return res.getBody();
                } else {
                    throw new AuraHandledException(
                        'Leadership API error ' + res.getStatusCode() + ': '
                        + AzureHttpService.parseErrorResponse(res)
                    );
                }
            } catch (AuraHandledException ahe) {
                throw ahe;
            } catch (Exception e) {
                throw new AuraHandledException('Error fetching leadership data: ' + e.getMessage());
            }
        }

    // ─────────────────────────────────────────────────────────────────────────
    // PDF Report URL
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getReportDownloadUrl(String companyId, String reportType) {
        String azureId  = getAzureCompanyId(companyId);
        String type     = String.isNotBlank(reportType) ? reportType : 'full';
        String endpoint = buildEndpoint('user/companies/' + azureId + '/report')
                          + '?type=' + EncodingUtil.urlEncode(type, 'UTF-8');
        HttpResponse res = makeAzureGet(endpoint, companyId);
        return handleResponse(res, 'getReportDownloadUrl', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // Pipeline Status
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getPipelineStatus(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/pipeline-status'),
            companyId
        );
        return handleResponse(res, 'getPipelineStatus', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // AI Navigator Report — GET /v1/user/companies/{azureCompanyId}/ai-navigator-report
    // Returns null on 404 so LWC can show "not yet generated" gracefully.
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAiNavigatorReport(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        HttpResponse res = makeAzureGet(
            buildEndpoint('user/companies/' + azureId + '/ai-navigator-report'),
            companyId
        );
        if (res.getStatusCode() == 404) {
            return null;
        }
        return handleResponse(res, 'getAiNavigatorReport', companyId);
    }



    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────


    private static String getAzureCompanyId(String salesforceCompanyId) {
        if (String.isBlank(salesforceCompanyId)) {
            throw new AuraHandledException('companyId is required.');
        }
        try {
            Company__c c = [
                SELECT Azure_Company_Id__c
                FROM   Company__c
                WHERE  Id = :salesforceCompanyId
                LIMIT  1
            ];
            if (String.isBlank(c.Azure_Company_Id__c)) {
                throw new AuraHandledException(
                    'Azure Company ID not yet available for this record. ' +
                    'Research may still be processing.'
                );
            }
            return c.Azure_Company_Id__c;
        } catch (QueryException e) {
            throw new AuraHandledException('Company record not found: ' + salesforceCompanyId);
        }
    }


    private static String buildEndpoint(String path) {
        return NAMED_CREDENTIAL + '/' + API_VERSION + '/' + path;
    }


    private static HttpResponse makeAzureGet(String endpoint, String salesforceCompanyId) {
        String subscriptionKey = CONFIG?.ApimSubscriptionKey__c;

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setTimeout(CALLOUT_TIMEOUT_MS);

        req.setHeader('Ocp-Apim-Subscription-Key', subscriptionKey != null ? subscriptionKey : '');
        req.setHeader('X-Client-Id',      UserInfo.getOrganizationId());
        req.setHeader('X-User-Id',        UserInfo.getUserId());
        req.setHeader('X-Correlation-Id', generateCorrelationId());
        req.setHeader('Content-Type',     'application/json');
        req.setHeader('Accept',           'application/json');

        try {
            return new Http().send(req);
        } catch (CalloutException e) {
            throw new AuraHandledException('Azure callout failed: ' + e.getMessage());
        }
    }
    private static HttpResponse makeAzureGetWithTimeout(String endpoint, String salesforceCompanyId, Integer timeoutMs) {
        String subscriptionKey = CONFIG?.ApimSubscriptionKey__c;

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setTimeout(timeoutMs);

        req.setHeader('Ocp-Apim-Subscription-Key', subscriptionKey != null ? subscriptionKey : '');
        req.setHeader('X-Client-Id',      UserInfo.getOrganizationId());
        req.setHeader('X-User-Id',        UserInfo.getUserId());
        req.setHeader('X-Correlation-Id', generateCorrelationId());
        req.setHeader('Content-Type',     'application/json');
        req.setHeader('Accept',           'application/json');

        try {
            return new Http().send(req);
        } catch (CalloutException e) {
            throw new AuraHandledException('Azure callout failed: ' + e.getMessage());
        }
    }

    private static String handleResponse(HttpResponse res, String context, String companyId) {
        Integer code = res.getStatusCode();

        if (code == 200 || code == 201 || code == 202) {
            return res.getBody();
        }

        String azureMessage = 'Azure returned HTTP ' + code;
        try {
            Map<String, Object> errBody =
                (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            if (errBody.containsKey('message')) {
                azureMessage = (String) errBody.get('message');
            }
        } catch (Exception ignored) { }

        System.debug(LoggingLevel.ERROR,
            'CompanyDetailController.' + context +
            ' | companyId=' + companyId +
            ' | HTTP=' + code +
            ' | body=' + res.getBody()
        );

        if (code == 404) {
            String notFoundMsg = context.containsIgnoreCase('VerticalIq') || 
                                context.containsIgnoreCase('Ucc')
                ? 'Industry data not yet available for this company. Try entering a NAICS code manually. (' + azureMessage + ')'
                : 'Research data not yet available for this company. It may still be processing. (' + azureMessage + ')';
            throw new AuraHandledException(notFoundMsg);
        }

        throw new AuraHandledException(azureMessage);
    }


    private static String generateCorrelationId() {
        String hex = EncodingUtil.convertToHex(
            Crypto.generateAesKey(128)
        ).substring(0, 8);
        return 'SF-' + String.valueOf(DateTime.now().getTime()) + '-' + hex;
    }
}
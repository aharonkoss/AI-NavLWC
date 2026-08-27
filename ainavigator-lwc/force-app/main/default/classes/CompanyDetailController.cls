/**
 * @description  Company Detail Controller — fetches all research data live
 *               from Azure AI Navigator API using the Azure_Company_Id__c
 *               stored on private static String getAzureCompanyId after RESEARCH_DONE platform event fires.
 *               Updated to use unified request logging object: AI_Navigator_Request_Log__c.
 * @author       AI Navigator Platform
 * @group        AI Navigator Integration
 * @last modified on  : 08-26-2026
**/
public with sharing class CompanyDetailController {

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG — loaded once from AI_Navigator_Config__mdt
    // ─────────────────────────────────────────────────────────────────────────
    // FIXED: Static initializer queries the local, unmanaged Dev record, falls back to packaged record if empty
    private static final AI_Navigator_Config__mdt CONFIG;
    
    static {
        List<AI_Navigator_Config__mdt> configs = [
            SELECT Client_Id__c, Azure_APIM_Base_URL__c, Named_Credential_Name__c,
                   Max_Retry_Attempts__c, Callout_Timeout_Ms__c,
                   Event_Schema_Version__c, Is_Active__c, ApimSubscriptionKey__c
            FROM   AI_Navigator_Config__mdt
            WHERE  DeveloperName = 'Dev'
            AND    NamespacePrefix = null
            LIMIT  1
        ];
        
        if (configs.isEmpty()) {
            configs = [
                SELECT Client_Id__c, Azure_APIM_Base_URL__c, Named_Credential_Name__c,
                       Max_Retry_Attempts__c, Callout_Timeout_Ms__c,
                       Event_Schema_Version__c, Is_Active__c, ApimSubscriptionKey__c
                FROM   AI_Navigator_Config__mdt
                WHERE  DeveloperName = 'Dev'
                LIMIT  1
            ];
        }
        CONFIG = configs.isEmpty() ? null : configs[0];
    }

    // FIXED: Reverted back to the original simple structure — reads the configured Named Credential directly
    private static final String NAMED_CREDENTIAL =
        'callout:' + (CONFIG?.Named_Credential_Name__c != null
                      ? CONFIG.Named_Credential_Name__c
                      : 'Azure_APIM_Dev');

    private static final Integer CALLOUT_TIMEOUT_MS =
        CONFIG?.Callout_Timeout_Ms__c != null
        ? Integer.valueOf(CONFIG.Callout_Timeout_Ms__c)
        : 60000;

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
            AI_Navigator_Company__c  c = [
                SELECT Id, Name, City__c, State__c,
                       Website__c, Status__c, Stage__c,
                       Client_Type__c, Client_Id__c,
                       Research_Completed_At__c,
                       Azure_Company_Id__c, Correlation_Id__c,
                       Prospect_Score__c, PDF_Report_URL__c,
                       Error_Message__c, Industry__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId 
                AND    OwnerId = :UserInfo.getUserId()
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
            throw new AuraHandledException('Research record not found or assigned to another user.');
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // All companies — Now filters by OwnerId
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAllCompanies() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        for (AI_Navigator_Company__c c : [
            SELECT Id, Name, City__c, State__c,
                   Website__c, Status__c, Stage__c,
                   Client_Type__c, Research_Completed_At__c,
                   Azure_Company_Id__c, Prospect_Score__c,
                   Industry__c, Is_Hidden__c
            FROM   AI_Navigator_Company__c
            WHERE  Is_Hidden__c = false
            AND    OwnerId = :UserInfo.getUserId()
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
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/live-updates');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /live-updates (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getLiveUpdates', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /live-updates Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Signals
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getSignals(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/signals');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /signals (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getSignals', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /signals Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // AI Research
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAiResearch(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/ai-research');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /ai-research (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getAiResearch', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /ai-research Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Insights
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getInsights(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/insights');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /insights (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getInsights', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /insights Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Call Plan
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCallPlan(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/discovery-call-plan');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /discovery-call-plan (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getCallPlan', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /discovery-call-plan Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Bundled fetch
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCompanyDetailBundle(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/detail');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /detail-bundle (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getCompanyDetailBundle', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /detail-bundle Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // UCC Filings — GET /v1/user/companies/{azureCompanyId}/ucc
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getUccFilings(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/ucc');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /ucc (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            if (res.getStatusCode() == 404) {
                return null;
            }
            return handleResponse(res, 'getUccFilings', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /ucc Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // VerticalIQ — GET /v1/user/companies/{azureCompanyId}/verticaliq
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getVerticalIqData(String companyId, String naicsCode) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId  = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/verticaliq');
            if (String.isNotBlank(naicsCode)) {
                endpoint += '?naicsCode=' + EncodingUtil.urlEncode(naicsCode.trim(), 'UTF-8');
            }
            HttpResponse res = makeAzureGetWithTimeout(endpoint, companyId, 30000, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /verticaliq (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            if (res.getStatusCode() == 404) {
                return null;
            }
            return handleResponse(res, 'getVerticalIqData', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c  (
                Name = ('GET /verticaliq Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Leadership Lookup — GET /v1/user/leadership-lookup
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getLeadership(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required.');
        }

        AI_Navigator_Company__c c;
        try {
            c = [
                SELECT Name, Website__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId
                LIMIT  1
            ];
        } catch (QueryException e) {
            throw new AuraHandledException('Company record not found: ' + companyId);
        }

        if (String.isBlank(c.Name)) {
            throw new AuraHandledException('Company name is required for leadership lookup.');
        }

        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String path = '/v1/user/leadership-lookup'
            + '?company=' + EncodingUtil.urlEncode(c.Name.trim(), 'UTF-8');

        if (String.isNotBlank(c.Website__c)) {
            path += '&url=' + EncodingUtil.urlEncode(c.Website__c.trim(), 'UTF-8');
        }

        try {
            HttpRequest req = AzureHttpService.buildRequest(
                'GET',
                path,
                correlationId,
                UserInfo.getUserId()
            );

            HttpResponse res = new Http().send(req);

            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /leadership-lookup (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = path.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            if (res.getStatusCode() == 404) {
                return null;
            }

            return handleResponse(res, 'getLeadership', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            // FIXED: Using correct custom object API name
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /leadership-lookup Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = path.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException('Leadership lookup callout failed: ' + e.getMessage());
        }
    }


    /**
     * getLeadershipData
     * Calls Azure GET /v1/user/leadership-lookup and returns raw JSON.
     * Scoped to Leadership tab only — utilizing the telemetry log pattern.
     */
    @AuraEnabled(cacheable=false)
    public static String getLeadershipData(String companyName, String companyUrl) {
        if (String.isBlank(companyName)) {
            throw new AuraHandledException('companyName is required');
        }
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String path = 'v1/user/leadership-lookup?company='
            + EncodingUtil.urlEncode(companyName, 'UTF-8')
            + (String.isNotBlank(companyUrl)
                ? '&url=' + EncodingUtil.urlEncode(companyUrl, 'UTF-8')
                : '');
        try {
            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, UserInfo.getUserId());
            HttpResponse res = new Http().send(req);

            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /leadership-lookup-data (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = path.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() == 200) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                throw new AuraHandledException(
                    'Leadership API error ' + res.getStatusCode() + ': '
                    + AzureHttpService.parseErrorResponse(res)
                );
            }
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /leadership-lookup-data Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = path.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException('Error fetching leadership data: ' + e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // PDF Report URL
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getReportDownloadUrl(String companyId, String reportType) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId  = getAzureCompanyId(companyId);
            String type     = String.isNotBlank(reportType) ? reportType : 'full';
            endpoint = buildEndpoint('user/companies/' + azureId + '/report')
                              + '?type=' + EncodingUtil.urlEncode(type, 'UTF-8');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /report (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getReportDownloadUrl', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /report Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Pipeline Status
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getPipelineStatus(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/pipeline-status');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /pipeline-status (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getPipelineStatus', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /pipeline-status Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // AI Navigator Report — GET /v1/user/companies/{azureCompanyId}/ai-navigator-report
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAiNavigatorReport(String companyId) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);
            endpoint = buildEndpoint('user/companies/' + azureId + '/ai-navigator-report');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /ai-navigator-report (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            if (res.getStatusCode() == 404) {
                return null;
            }
            return handleResponse(res, 'getAiNavigatorReport', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            // FIXED: Using correct custom object API names
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /ai-navigator-report Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tab PDF Download URL — GET /v1/user/companies/{azureCompanyId}/{tab}/pdf
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getTabPdfDownloadUrl(String companyId, String tabName) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String endpoint = '';
        try {
            String azureId = getAzureCompanyId(companyId);

            // Map the tab name to the API route segment
            String pathSegment = 'research-library';
            if (String.isNotBlank(tabName)) {
                String cleanTab = tabName.toLowerCase();
                if (cleanTab == 'leadership') {
                    pathSegment = 'leadership';
                } else if (cleanTab == 'ucc') {
                    pathSegment = 'ucc';
                } else if (cleanTab == 'researchlibrary' || cleanTab == 'research-library') {
                    pathSegment = 'research-library';
                } else {
                    pathSegment = cleanTab;
                }
            }

            endpoint = buildEndpoint('user/companies/' + azureId + '/' + pathSegment + '/pdf');
            HttpResponse res = makeAzureGet(endpoint, companyId, correlationId);
            
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /' + pathSegment + '/pdf (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Response_Body__c = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c = correlationId
            );

            return handleResponse(res, 'getTabPdfDownloadUrl', companyId);
        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name = ('GET /tab-pdf Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c = 'GET',
                Endpoint_Name__c = endpoint.left(255),
                Request_Timestamp__c = DateTime.now(),
                Error_Message__c = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c = 'Failed',
                Correlation_ID__c = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private static String getAzureCompanyId(String salesforceCompanyId) {
        if (String.isBlank(salesforceCompanyId)) {
            throw new AuraHandledException('companyId is required.');
        }
        try {
              AI_Navigator_Company__c c = [
                SELECT Azure_Company_Id__c
                FROM   AI_Navigator_Company__c
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


    private static HttpResponse makeAzureGet(String endpoint, String salesforceCompanyId, String correlationId) {
        String subscriptionKey = CONFIG?.ApimSubscriptionKey__c;

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setTimeout(CALLOUT_TIMEOUT_MS);

        req.setHeader('Ocp-Apim-Subscription-Key', subscriptionKey != null ? subscriptionKey : '');
        req.setHeader('X-Client-Id',      UserInfo.getOrganizationId());
        req.setHeader('X-User-Id',        UserInfo.getUserId());
        req.setHeader('X-Correlation-Id', correlationId);
        req.setHeader('Content-Type',     'application/json');
        req.setHeader('Accept',           'application/json');

        return new Http().send(req);
    }


    private static HttpResponse makeAzureGetWithTimeout(String endpoint, String salesforceCompanyId, Integer timeoutMs, String correlationId) {
        String subscriptionKey = CONFIG?.ApimSubscriptionKey__c;

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setTimeout(timeoutMs);

        req.setHeader('Ocp-Apim-Subscription-Key', subscriptionKey != null ? subscriptionKey : '');
        req.setHeader('X-Client-Id',      UserInfo.getOrganizationId());
        req.setHeader('X-User-Id',        UserInfo.getUserId());
        req.setHeader('X-Correlation-Id', correlationId);
        req.setHeader('Content-Type',     'application/json');
        req.setHeader('Accept',           'application/json');

        return new Http().send(req);
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
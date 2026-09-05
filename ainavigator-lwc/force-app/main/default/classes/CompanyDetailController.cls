/**
 * @description  Company Detail Controller — fetches research data live from Azure AI Navigator API.
 *               Uses unified AzureHttpService and AI_Navigator_Request_Log__c.
 * @group        AI Navigator Integration
**/
public with sharing class CompanyDetailController {

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

    // ─────────────────────────────────────────────────────────────────────────
    // Company Header Data
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCompany(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required.');
        }
        try {
            AI_Navigator_Company__c c = [
                SELECT Id, Name, City__c, State__c,
                       Website__c, Status__c, Stage_List__c,
                       Client_Type_List__c, Client_Id__c,
                       Research_Completed_At__c,
                       Azure_Company_Id__c, Correlation_Id__c,
                       Prospect_Score__c, PDF_Report_URL__c,
                       Error_Message__c, Industry__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId 
                LIMIT  1
            ];
            
            Map<String, Object> result = new Map<String, Object>{
                'id'             => c.Id,
                'companyId'      => c.Id,
                'azureCompanyId' => c.Azure_Company_Id__c,
                'correlationId'  => c.Correlation_Id__c,
                'name'           => c.Name,
                'city'           => c.City__c,
                'state'          => c.State__c,
                'website'        => c.Website__c,
                'status'         => c.Status__c,
                'stage'          => c.Stage_List__c,
                'clientType'     => c.Client_Type_List__c,
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
        } catch (Exception e) {
            throw createHandledException('Error loading company: ' + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // All Companies
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAllCompanies() {
        try {
            List<Map<String, Object>> result = new List<Map<String, Object>>();
            for (AI_Navigator_Company__c c : [
                SELECT Id, Name, City__c, State__c,
                       Website__c, Status__c, Stage_List__c,
                       Client_Type_List__c, Research_Completed_At__c,
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
                    'stage'          => c.Stage_List__c,
                    'clientType'     => c.Client_Type_List__c,
                    'industry'       => c.Industry__c,
                    'prospectScore'  => c.Prospect_Score__c,
                    'updatedAt'      => c.Research_Completed_At__c != null
                                           ? String.valueOf(c.Research_Completed_At__c.date())
                                           : null
                });
            }
            return JSON.serialize(result);
        } catch (Exception e) {
            throw createHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Live Updates
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getLiveUpdates(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/live-updates';
        return executeAzureRequest('GET', path, 'getLiveUpdates', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Signals
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getSignals(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/signals';
        return executeAzureRequest('GET', path, 'getSignals', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI Research
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAiResearch(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/ai-research';
        return executeAzureRequest('GET', path, 'getAiResearch', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Insights
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getInsights(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/insights';
        return executeAzureRequest('GET', path, 'getInsights', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Call Plan
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCallPlan(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/discovery-call-plan';
        return executeAzureRequest('GET', path, 'getCallPlan', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bundled Fetch
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getCompanyDetailBundle(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/detail';
        return executeAzureRequest('GET', path, 'getCompanyDetailBundle', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UCC Filings
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getUccFilings(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/ucc';
        return executeAzureRequest('GET', path, 'getUccFilings', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VerticalIQ
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getVerticalIqData(String companyId, String naicsCode) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/verticaliq';
        if (String.isNotBlank(naicsCode)) {
            path += '?naicsCode=' + EncodingUtil.urlEncode(naicsCode.trim(), 'UTF-8');
        }
        return executeAzureRequest('GET', path, 'getVerticalIqData', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Leadership Lookup — GET /v1/user/leadership-lookup
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getLeadership(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required.');
        }

        AI_Navigator_Company__c c;
        try {
            c = [
                SELECT Name, Website__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId
                LIMIT  1
            ];
        } catch (Exception e) {
            throw createHandledException('Company record not found: ' + companyId);
        }

        if (String.isBlank(c.Name)) {
            throw createHandledException('Company name is required for leadership lookup.');
        }

        String path = '/v1/user/leadership-lookup?company=' + EncodingUtil.urlEncode(c.Name.trim(), 'UTF-8');
        if (String.isNotBlank(c.Website__c)) {
            path += '&url=' + EncodingUtil.urlEncode(c.Website__c.trim(), 'UTF-8');
        }

        return executeAzureRequest('GET', path, 'getLeadership', null);
    }

    @AuraEnabled(cacheable=false)
    public static String getLeadershipData(String companyName, String companyUrl) {
        if (String.isBlank(companyName)) {
            throw createHandledException('companyName is required');
        }
        String path = '/v1/user/leadership-lookup?company=' + EncodingUtil.urlEncode(companyName, 'UTF-8')
            + (String.isNotBlank(companyUrl) ? '&url=' + EncodingUtil.urlEncode(companyUrl, 'UTF-8') : '');
        return executeAzureRequest('GET', path, 'getLeadershipData', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PDF Report URL
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getReportDownloadUrl(String companyId, String reportType) {
        String azureId = getAzureCompanyId(companyId);
        String type = String.isNotBlank(reportType) ? reportType : 'full';
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/report?type=' + EncodingUtil.urlEncode(type, 'UTF-8');
        return executeAzureRequest('GET', path, 'getReportDownloadUrl', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pipeline Status
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getPipelineStatus(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/pipeline-status';
        return executeAzureRequest('GET', path, 'getPipelineStatus', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI Navigator Report
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getAiNavigatorReport(String companyId) {
        String azureId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/ai-navigator-report';
        return executeAzureRequest('GET', path, 'getAiNavigatorReport', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tab PDF Download URL
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getTabPdfDownloadUrl(String companyId, String tabName) {
        String azureId = getAzureCompanyId(companyId);
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
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureId, 'UTF-8') + '/' + pathSegment + '/pdf';
        return executeAzureRequest('GET', path, 'getTabPdfDownloadUrl', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notes CRUD
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String getNotes(String companyId) {
        String azureCompanyId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/notes';
        return executeAzureRequest('GET', path, 'getNotes', null);
    }

    @AuraEnabled(cacheable=false)
    public static String createNote(String companyId, String title, String content, String sourceTab, String sourceSection) {
        String azureCompanyId = getAzureCompanyId(companyId);
        String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/notes';
        Map<String, Object> payload = new Map<String, Object>{
            'title'         => title,
            'content'       => content,
            'sourceTab'     => String.isNotBlank(sourceTab) ? sourceTab : 'Discovery Call Plan',
            'sourceSection' => String.isNotBlank(sourceSection) ? sourceSection : ''
        };
        return executeAzureRequest('POST', path, 'createNote', JSON.serialize(payload));
    }

    @AuraEnabled(cacheable=false)
    public static String updateNote(String noteId, String title, String content) {
        if (String.isBlank(noteId)) {
            throw createHandledException('noteId is required.');
        }
        String path = '/v1/user/notes/' + EncodingUtil.urlEncode(noteId.trim(), 'UTF-8');
        Map<String, Object> payload = new Map<String, Object>{
            'title'   => title,
            'content' => content
        };
        return executeAzureRequest('PUT', path, 'updateNote', JSON.serialize(payload));
    }

    @AuraEnabled(cacheable=false)
    public static String deleteNote(String noteId) {
        if (String.isBlank(noteId)) {
            throw createHandledException('noteId is required.');
        }
        String path = '/v1/user/notes/' + EncodingUtil.urlEncode(noteId.trim(), 'UTF-8');
        return executeAzureRequest('DELETE', path, 'deleteNote', null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CENTRAL EXECUTOR: Uses AzureHttpService and Logs Telemetry
    // ─────────────────────────────────────────────────────────────────────────
    private static String executeAzureRequest(String method, String path, String operationName, String jsonBody) {
        Long startTime = System.currentTimeMillis();
        String correlationId = generateCorrelationId();
        String userId = UserInfo.getUserId();
        HttpResponse res;

        try {
            HttpRequest req = AzureHttpService.buildRequest(method, path, correlationId, userId);
            if (String.isNotBlank(jsonBody)) {
                req.setBody(jsonBody);
                req.setHeader('Content-Type', 'application/json');
            }

            res = new Http().send(req);
            Long durationMs = System.currentTimeMillis() - startTime;

            insert new AI_Navigator_Request_Log__c(
                Name                = (method + ' ' + path + ' (' + durationMs + 'ms)').left(80),
                HTTP_Method__c      = method,
                Endpoint_Name__c    = ('CompanyDetailController.' + operationName).left(255),
                Request_Timestamp__c= DateTime.now(),
                Response_Body__c    = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                HTTP_Status_Code__c = res.getStatusCode(),
                Status__c           = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                Correlation_ID__c   = correlationId
            );

            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return res.getBody();
            } else if (res.getStatusCode() == 404) {
                return null;
            } else {
                throw createHandledException('Azure API error (' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = (method + ' ' + path + ' Error (' + durationMs + 'ms)').left(80),
                    HTTP_Method__c      = method,
                    Endpoint_Name__c    = ('CompanyDetailController.' + operationName).left(255),
                    Request_Timestamp__c= DateTime.now(),
                    Error_Message__c    = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                    Status__c           = 'Failed',
                    Correlation_ID__c   = correlationId
                );
            } catch (Exception logEx) {
                System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
            }
            throw createHandledException(e.getMessage());
        }
    }

    private static String getAzureCompanyId(String salesforceCompanyId) {
        if (String.isBlank(salesforceCompanyId)) {
            throw createHandledException('companyId is required.');
        }
        try {
            AI_Navigator_Company__c c = [
                SELECT Azure_Company_Id__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :salesforceCompanyId
                LIMIT  1
            ];
            if (String.isBlank(c.Azure_Company_Id__c)) {
                throw createHandledException('Azure Company ID not yet available for this record. Research may still be processing.');
            }
            return c.Azure_Company_Id__c;
        } catch (QueryException e) {
            throw createHandledException('Company record not found: ' + salesforceCompanyId);
        }
    }

    private static String generateCorrelationId() {
        String hex = EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 8);
        return 'SF-' + String.valueOf(DateTime.now().getTime()) + '-' + hex;
    }

    private static AuraHandledException createHandledException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
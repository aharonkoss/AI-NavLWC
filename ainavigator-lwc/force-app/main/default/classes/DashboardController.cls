/**
 * @description DashboardController — Salesforce database updates, pipeline polling,
 *              sharing actions, manual company submission, Lead creation with State Picklist support,
 *              Azure AI Prospecting Discovery, and cross-user duplicate checks.
 * @group AI Navigator - Apex
 */
public without sharing class DashboardController {

    private static final AI_Navigator_Config__mdt CONFIG;
    
    static {
        List<AI_Navigator_Config__mdt> configs = [
            SELECT Named_Credential_Name__c, Callout_Timeout_Ms__c
            FROM   AI_Navigator_Config__mdt
            WHERE  DeveloperName = 'Dev'
            AND    NamespacePrefix = null
            LIMIT  1
        ];
        
        if (configs.isEmpty()) {
            configs = [
                SELECT Named_Credential_Name__c, Callout_Timeout_Ms__c
                FROM   AI_Navigator_Config__mdt
                WHERE  DeveloperName = 'Dev'
                LIMIT  1
            ];
        }
        CONFIG = configs.isEmpty() ? null : configs[0];
    }

    private static final String NAMED_CRED =
        'callout:' + (CONFIG?.Named_Credential_Name__c != null
                      ? CONFIG.Named_Credential_Name__c
                      : 'ainavigator__Azure_APIM_Dev');

    private static final Integer TIMEOUT_MS = 60000;

    // US State Code to Full Name Mapping for State/Country Picklist validation
    private static final Map<String, String> STATE_CODE_TO_NAME = new Map<String, String>{
        'AL' => 'Alabama', 'AK' => 'Alaska', 'AZ' => 'Arizona', 'AR' => 'Arkansas',
        'CA' => 'California', 'CO' => 'Colorado', 'CT' => 'Connecticut', 'DE' => 'Delaware',
        'FL' => 'Florida', 'GA' => 'Georgia', 'HI' => 'Hawaii', 'ID' => 'Idaho',
        'IL' => 'Illinois', 'IN' => 'Indiana', 'IA' => 'Iowa', 'KS' => 'Kansas',
        'KY' => 'Kentucky', 'LA' => 'Louisiana', 'ME' => 'Maine', 'MD' => 'Maryland',
        'MA' => 'Massachusetts', 'MI' => 'Michigan', 'MN' => 'Minnesota', 'MS' => 'Mississippi',
        'MO' => 'Missouri', 'MT' => 'Montana', 'NE' => 'Nebraska', 'NV' => 'Nevada',
        'NH' => 'New Hampshire', 'NJ' => 'New Jersey', 'NM' => 'New Mexico', 'NY' => 'New York',
        'NC' => 'North Carolina', 'ND' => 'North Dakota', 'OH' => 'Ohio', 'OK' => 'Oklahoma',
        'OR' => 'Oregon', 'PA' => 'Pennsylvania', 'RI' => 'Rhode Island', 'SC' => 'South Carolina',
        'SD' => 'South Dakota', 'TN' => 'Tennessee', 'TX' => 'Texas', 'UT' => 'Utah',
        'VT' => 'Vermont', 'VA' => 'Virginia', 'WA' => 'Washington', 'WV' => 'West Virginia',
        'WI' => 'Wisconsin', 'WY' => 'Wyoming', 'DC' => 'District of Columbia'
    };

    // -------------------------------------------------------------------------
    // getDashboardStats
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getDashboardStats() {
        try {
            AggregateResult[] rows = [
                SELECT Status__c status, COUNT(Id) cnt
                FROM   AI_Navigator_Company__c
                WHERE  OwnerId = :UserInfo.getUserId()
                AND    Is_Hidden__c = false
                GROUP BY Status__c
            ];

            Integer totalCompanies = 0;
            Integer processing     = 0;
            Integer completed      = 0;
            Integer opened         = 0;

            for (AggregateResult ar : rows) {
                Integer cnt = Integer.valueOf(ar.get('cnt'));
                totalCompanies += cnt;
                String st = String.valueOf(ar.get('status')).toLowerCase();
                if      (st == 'processing' || st == 'pending') { processing += cnt; }
                else if (st == 'completed')  { completed  += cnt; }
            }

            return JSON.serialize(new Map<String, Object>{
                'totalCompanies' => totalCompanies,
                'processing'     => processing,
                'completed'      => completed,
                'opened'         => opened
            });
        } catch (Exception e) {
            throw createHandledException('Error fetching dashboard stats: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // getCompanies
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getCompanies() {
        try {
            List<AI_Navigator_Company__c> records = [
                SELECT Id, Name, City__c, State__c, Website__c,
                       Status__c, Stage_List__c, Client_Type_List__c,
                       Azure_Company_Id__c, Correlation_Id__c, CreatedDate, Shared_By_Name__c,
                       (SELECT Id FROM AI_Navigator_Shared_With_Users__r) 
                FROM   AI_Navigator_Company__c
                WHERE  OwnerId = :UserInfo.getUserId()
                AND    Is_Hidden__c = false
                ORDER BY CreatedDate DESC
                LIMIT  500
            ];

            List<Map<String, Object>> companies = new List<Map<String, Object>>();
            for (AI_Navigator_Company__c c : records) {
                companies.add(new Map<String, Object>{
                    'id'             => c.Id,
                    'companyId'      => c.Id,
                    'azureCompanyId' => c.Azure_Company_Id__c,
                    'correlationId'  => c.Correlation_Id__c,
                    'name'           => c.Name,
                    'city'           => c.City__c,
                    'state'          => c.State__c,
                    'website'        => c.Website__c,
                    'status'         => c.Status__c?.toLowerCase(),
                    'stage'          => c.Stage_List__c,
                    'clientType'     => c.Client_Type_List__c,
                    'createdAt'      => c.CreatedDate,
                    'sharedByName'   => c.Shared_By_Name__c,
                    'isShared'       => !c.AI_Navigator_Shared_With_Users__r.isEmpty()
                });
            }
            return JSON.serialize(companies);
        } catch (Exception e) {
            throw createHandledException('Error fetching companies: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // getPipelineStatus (Azure Polling API)
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getPipelineStatus(String salesforceCompanyId) {
        String correlationId = '';
        try {
            if (String.isBlank(salesforceCompanyId)) {
                throw createHandledException('salesforceCompanyId is required.');
            }

            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c, Status__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :salesforceCompanyId
                LIMIT  1
            ];

            if (companies.isEmpty()) {
                throw createHandledException('Company not found for Id: ' + salesforceCompanyId);
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;
            if (String.isBlank(azureCompanyId)) {
                throw createHandledException('This company has not been synced to Azure yet (Azure_Company_Id__c is blank).');
            }

            correlationId = String.isNotBlank(companies[0].Correlation_Id__c) 
                ? companies[0].Correlation_Id__c 
                : generateCorrelationId();
            String userId = UserInfo.getUserId();
            String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/pipeline-status';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() == 200) {
                Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                String returnedStatus = (String) data.get('status');
                
                if (String.isNotBlank(returnedStatus) && returnedStatus.equalsIgnoreCase('completed') && companies[0].Status__c != 'completed') {
                    companies[0].Status__c = 'completed';
                    update companies[0];
                }
                return res.getBody();
            } else {
                throw createHandledException(AzureHttpService.parseErrorResponse(res));
            }
        } catch (AuraHandledException ahe) {
            logError('DashboardController.getPipelineStatus', 'GET', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            logError('DashboardController.getPipelineStatus', 'GET', correlationId, e.getMessage());
            throw createHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getTeammates() {
        List<Map<String, String>> teammates = new List<Map<String, String>>();
        Id currentProfileId = UserInfo.getProfileId();
        for (User u : [SELECT Id, Name FROM User WHERE ProfileId = :currentProfileId AND IsActive = true AND Id != :UserInfo.getUserId()]) {
            teammates.add(new Map<String, String>{ 'value' => u.Id, 'label' => u.Name });
        }
        return teammates;
    }

    // -------------------------------------------------------------------------
    // shareCompanies
    // -------------------------------------------------------------------------
    @AuraEnabled
    public static String shareCompanies(List<String> companyIds, String targetUserId) {
        String actingUserId   = UserInfo.getUserId();
        String correlationId  = '';
        String targetUserId18 = '';

        try {
            if (companyIds == null || companyIds.isEmpty()) {
                throw createHandledException('No companies selected to share.');
            }
            if (String.isBlank(targetUserId)) {
                throw createHandledException('targetUserId is required.');
            }

            targetUserId18 = String.valueOf((Id) targetUserId);

            List<AI_Navigator_Company__c> originalRecords = [
                SELECT Id, Name, City__c, State__c, Website__c, Status__c, 
                       Stage_List__c, Client_Type_List__c, Azure_Company_Id__c, Correlation_Id__c 
                FROM   AI_Navigator_Company__c 
                WHERE  Id IN :companyIds
                AND    OwnerId = :actingUserId
            ];

            if (originalRecords.isEmpty()) {
                throw createHandledException('No eligible companies found for sharing.');
            }

            correlationId = String.isNotBlank(originalRecords[0].Correlation_Id__c)
                ? originalRecords[0].Correlation_Id__c
                : generateCorrelationId();

            List<String> azureCompanyIds = new List<String>();
            List<String> sfCompanyIds    = new List<String>();

            for (AI_Navigator_Company__c original : originalRecords) {
                if (String.isNotBlank(original.Azure_Company_Id__c)) {
                    azureCompanyIds.add(original.Azure_Company_Id__c);
                    sfCompanyIds.add(original.Id);
                }
            }

            if (azureCompanyIds.isEmpty()) {
                throw createHandledException('Selected companies must have an Azure Company ID before sharing.');
            }

            HttpRequest req = AzureHttpService.buildRequest('POST', '/v1/user/companies/share', correlationId, actingUserId);

            Map<String, Object> requestPayload = new Map<String, Object>{
                'companyIds'    => azureCompanyIds,
                'targetUserId'  => targetUserId18,
                'salesforceIds' => sfCompanyIds
            };
            req.setBody(JSON.serialize(requestPayload));

            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                String errorMsg = AzureHttpService.parseErrorResponse(res);
                System.debug(LoggingLevel.WARN, 'DashboardController.shareCompanies – ' + errorMsg);
                throw createHandledException('Azure share failed: ' + errorMsg);
            }

            List<AI_Navigator_Company__c> clones = new List<AI_Navigator_Company__c>();
            for (AI_Navigator_Company__c original : originalRecords) {
                AI_Navigator_Company__c clone = original.clone(false, true, false, false);
                clone.OwnerId           = targetUserId18;
                clone.Assigned_User__c  = targetUserId18;
                clone.Shared_By_Name__c = UserInfo.getName();
                clones.add(clone);
            }
            insert clones;

            List<AI_Navigator_Shared_Company__c> junctions = new List<AI_Navigator_Shared_Company__c>();
            for (Integer i = 0; i < originalRecords.size(); i++) {
                junctions.add(new AI_Navigator_Shared_Company__c(
                    Source_Company__c = originalRecords[i].Id,
                    Target_Company__c = clones[i].Id,
                    User__c           = targetUserId18
                ));
            }
            insert junctions;

            return JSON.serialize(new Map<String, Object>{ 'success' => true });

        } catch (AzureHttpService.AzureHttpServiceException serviceEx) {
            logError('DashboardController.shareCompanies', 'POST', correlationId, serviceEx.getMessage());
            throw createHandledException(serviceEx.getMessage() + ' [targetUserId: ' + targetUserId18 + ']');
        } catch (AuraHandledException ahe) {
            logError('DashboardController.shareCompanies', 'POST', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DashboardController.shareCompanies – ' + e.getMessage());
            logError('DashboardController.shareCompanies', 'POST', correlationId, e.getMessage());
            throw createHandledException('Unable to share companies: ' + e.getMessage() + ' [targetUserId: ' + targetUserId18 + ']');
        }
    } 

    @AuraEnabled(cacheable=false)
    public static List<Map<String, String>> getSharedUsers(String companyId) {
        List<Map<String, String>> sharedUsers = new List<Map<String, String>>();
        for (AI_Navigator_Shared_Company__c sc : [SELECT Id, User__r.Name, User__c FROM AI_Navigator_Shared_Company__c WHERE Source_Company__c = :companyId]) {
            sharedUsers.add(new Map<String, String>{ 'id' => sc.Id, 'name' => sc.User__r.Name });
        }
        return sharedUsers;
    }

    @AuraEnabled
    public static void unshareCompany(String sharedCompanyRecordId) {
        String correlationId = generateCorrelationId();
        try {
            AI_Navigator_Shared_Company__c sc = [SELECT Id, Source_Company__r.Azure_Company_Id__c, Target_Company__c, User__c 
                                    FROM AI_Navigator_Shared_Company__c WHERE Id = :sharedCompanyRecordId LIMIT 1];
            
            HttpRequest req = AzureHttpService.buildRequest('POST', '/v1/user/companies/unshare', correlationId, UserInfo.getUserId());
            req.setBody(JSON.serialize(new Map<String, Object>{
                'companyIds' => new List<String>{ sc.Source_Company__r.Azure_Company_Id__c },
                'targetUserId' => sc.User__c
            }));
            
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                throw createHandledException('Unshare failed on Azure: ' + AzureHttpService.parseErrorResponse(res));
            }
            delete new AI_Navigator_Company__c(Id = sc.Target_Company__c);
            delete sc;
        } catch (Exception e) {
            logError('DashboardController.unshareCompany', 'POST', correlationId, e.getMessage());
            throw createHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=false)
    public static String getSignals(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required');
        }
        try {
            List<AI_Navigator_Signals__c> rows = [
                SELECT Id, Name, Signal_Type__c, Headline__c,
                       Priority__c, Impact__c, Source__c,
                       Is_New__c, Detected_At__c
                FROM   AI_Navigator_Signals__c
                WHERE  AI_Navigator_Company__c = :companyId
                ORDER BY Detected_At__c DESC NULLS LAST
                LIMIT  200
            ];

            List<Map<String, Object>> signals = new List<Map<String, Object>>();
            for (AI_Navigator_Signals__c s : rows) {
                signals.add(new Map<String, Object>{
                    'id'                => s.Id,
                    'signalName'        => s.Name,
                    'signalType'        => s.Signal_Type__c,
                    'headline'          => s.Headline__c,
                    'priority'          => s.Priority__c,
                    'impact'            => s.Impact__c,
                    'source'            => s.Source__c,
                    'isNew'             => s.Is_New__c,
                    'detectedAt'        => s.Detected_At__c,
                    'signalCategory'    => s.Signal_Type__c,
                    'signalDescription' => s.Headline__c,
                    'eventDate'         => s.Detected_At__c
                });
            }
            return JSON.serialize(signals);
        } catch (Exception e) {
            throw createHandledException('Error fetching signals: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // updateCompany (Pure Salesforce Object Update - No API Callout)
    // -------------------------------------------------------------------------
    @AuraEnabled
    public static String updateCompany(String companyId, String stage, String clientType) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required');
        }
        try {
            AI_Navigator_Company__c company = [
                SELECT Id, Stage_List__c, Client_Type_List__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId
                AND    OwnerId = :UserInfo.getUserId()
                LIMIT  1
            ];

            Boolean changed = false;
            if (String.isNotBlank(stage) && stage != company.Stage_List__c) {
                company.Stage_List__c = stage;
                changed = true;
            }
            if (String.isNotBlank(clientType) && clientType != company.Client_Type_List__c) {
                company.Client_Type_List__c = clientType;
                changed = true;
            }
            
            if (changed) { 
                update company; 
            }

            return JSON.serialize(new Map<String, Object>{
                'success'    => true,
                'companyId'  => companyId,
                'stage'      => company.Stage_List__c,
                'clientType' => company.Client_Type_List__c
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw createHandledException('Error updating company: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // deleteCompany
    // -------------------------------------------------------------------------
    @AuraEnabled
    public static String deleteCompany(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required');
        }

        String actingUserId  = UserInfo.getUserId();
        String correlationId = '';

        try {
            AI_Navigator_Company__c company = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId
                AND    OwnerId = :actingUserId
                LIMIT  1
            ];

            correlationId = String.isNotBlank(company.Correlation_Id__c)
                ? company.Correlation_Id__c
                : generateCorrelationId();

            if (String.isNotBlank(company.Azure_Company_Id__c)) {
                String path = '/v1/user/companies/' + EncodingUtil.urlEncode(company.Azure_Company_Id__c, 'UTF-8');
                HttpRequest req = AzureHttpService.buildRequest('DELETE', path, correlationId, actingUserId);

                HttpResponse res = new Http().send(req);

                if (res.getStatusCode() >= 300 && res.getStatusCode() != 404) {
                    throw createHandledException('Azure company deletion failed: ' + AzureHttpService.parseErrorResponse(res));
                }
            }

            List<AI_Navigator_Shared_Company__c> junctions = [
                SELECT Id 
                FROM   AI_Navigator_Shared_Company__c 
                WHERE  Source_Company__c = :companyId 
                OR     Target_Company__c = :companyId
            ];
            if (!junctions.isEmpty()) {
                delete junctions;
            }

            delete company;

            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId
            });

        } catch (AzureHttpService.AzureHttpServiceException serviceEx) {
            logError('DashboardController.deleteCompany', 'DELETE', correlationId, serviceEx.getMessage());
            throw createHandledException(serviceEx.getMessage());
        } catch (AuraHandledException ahe) {
            logError('DashboardController.deleteCompany', 'DELETE', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DashboardController.deleteCompany – ' + e.getMessage());
            logError('DashboardController.deleteCompany', 'DELETE', correlationId, e.getMessage());
            throw createHandledException('Error deleting company: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String retryCompany(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required');
        }
        try {
            AI_Navigator_Company__c company = [
                SELECT Id, Azure_Company_Id__c, Status__c
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId
                AND    OwnerId = :UserInfo.getUserId()
                LIMIT  1
            ];

            if (company.Status__c?.toLowerCase() != 'failed') {
                throw createHandledException('Only failed companies can be retried.');
            }

            if (String.isNotBlank(company.Azure_Company_Id__c)) {
                HttpResponse res = azureCallout(
                    'POST',
                    '/v1/user/companies/' + EncodingUtil.urlEncode(company.Azure_Company_Id__c, 'UTF-8') + '/retry',
                    new Map<String, Object>(), TIMEOUT_MS
                );
                handleCalloutResponse(res, 'retryCompany', company.Azure_Company_Id__c);
            }

            company.Status__c = 'pending';
            update company;

            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw createHandledException('Error retrying company: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=false)
    public static String getCompanyInfo(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required');
        }
        try {
            AI_Navigator_Company__c c = [
                SELECT Id, Name, City__c, State__c, Website__c,
                       Status__c, Stage_List__c, Client_Type_List__c,
                       Azure_Company_Id__c, CreatedDate
                FROM   AI_Navigator_Company__c
                WHERE  Id = :companyId
                LIMIT  1
            ];
            return JSON.serialize(new Map<String, Object>{
                'id'             => c.Id,
                'companyId'      => c.Id,
                'azureCompanyId' => c.Azure_Company_Id__c,
                'name'           => c.Name,
                'city'           => c.City__c,
                'state'          => c.State__c,
                'website'        => c.Website__c,
                'status'         => c.Status__c?.toLowerCase(),
                'stage'          => c.Stage_List__c,
                'clientType'     => c.Client_Type_List__c,
                'createdAt'      => c.CreatedDate
            });
        } catch (Exception e) {
            throw createHandledException('Error fetching company info: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=false)
    public static String getCallPlan(String companyId) {
        return JSON.serialize(new Map<String, Object>{
            'companyId' => companyId,
            'callPlan'  => null,
            'message'   => 'Use CompanyDetailController.getAiResearch for full call plan data.'
        });
    }

    // -------------------------------------------------------------------------
    // Picklist Options
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=true)
    public static String getStageOptions() {
        try {
            List<Map<String, String>> options = new List<Map<String, String>>();
            Schema.DescribeFieldResult fieldResult = AI_Navigator_Company__c.Stage_List__c.getDescribe();
            for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
                if (entry.isActive()) {
                    options.add(new Map<String, String>{
                        'label' => entry.getLabel(),
                        'value' => entry.getValue()
                    });
                }
            }
            return JSON.serialize(options);
        } catch (Exception e) {
            throw createHandledException('Error fetching stage options: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static String getClientTypeOptions() {
        try {
            List<Map<String, String>> options = new List<Map<String, String>>();
            Schema.DescribeFieldResult fieldResult = AI_Navigator_Company__c.Client_Type_List__c.getDescribe();
            for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
                if (entry.isActive()) {
                    options.add(new Map<String, String>{
                        'label' => entry.getLabel(),
                        'value' => entry.getValue()
                    });
                }
            }
            return JSON.serialize(options);
        } catch (Exception e) {
            throw createHandledException('Error fetching client type options: ' + e.getMessage());
        }
    }

    // =========================================================================
    // PROSPECT DISCOVERY ENDPOINTS (Uses ProspectingHttpService)
    // =========================================================================

    /**
     * @description Starts a prospecting search for the current user.
     *              POST /prospecting/v1/user/prospects/ai-recommendations
     */
    @AuraEnabled
    public static String startProspectDiscovery(String filtersJson) {
        String userId        = UserInfo.getUserId();
        String correlationId = generateCorrelationId();

        try {
            String path = '/prospecting/v1/user/prospects/ai-recommendations';
            HttpRequest req = ProspectingHttpService.buildRequest('POST', path, correlationId, userId);

            Map<String, Object> bodyMap = new Map<String, Object>();
            if (String.isNotBlank(filtersJson)) {
                Object parsed = JSON.deserializeUntyped(filtersJson);
                if (parsed instanceof Map<String, Object>) {
                    Map<String, Object> parsedMap = (Map<String, Object>) parsed;
                    if (parsedMap.containsKey('filters')) {
                        bodyMap = parsedMap;
                    } else {
                        bodyMap.put('filters', parsedMap);
                    }
                } else {
                    bodyMap.put('filters', parsed);
                }
            } else {
                bodyMap.put('filters', new Map<String, Object>{
                    'revenueRanges'  => new List<String>(),
                    'employeeRanges' => new List<String>(),
                    'companyAges'    => new List<String>(),
                    'locations'      => new List<Object>(),
                    'industries'     => new List<Object>(),
                    'signals'        => new List<String>()
                });
            }

            req.setBody(JSON.serialize(bodyMap));

            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                String errorMsg = ProspectingHttpService.parseErrorResponse(res);
                System.debug(LoggingLevel.WARN, 'startProspectDiscovery error: ' + errorMsg);
                throw createHandledException(errorMsg);
            }

            return res.getBody();

        } catch (AuraHandledException ahe) {
            logError('DashboardController.startProspectDiscovery', 'POST', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DashboardController.startProspectDiscovery – ' + e.getMessage());
            logError('DashboardController.startProspectDiscovery', 'POST', correlationId, e.getMessage());
            throw createHandledException('Error starting prospect discovery: ' + e.getMessage());
        }
    }

    /**
     * @description Polls the status endpoint for discovery results.
     *              GET /prospecting/v1/user/prospects/ai-recommendations/status
     */
    @AuraEnabled
    public static String getProspectDiscoveryStatus() {
        String userId        = UserInfo.getUserId();
        String correlationId = generateCorrelationId();

        try {
            String path = '/prospecting/v1/user/prospects/ai-recommendations/status';
            HttpRequest req = ProspectingHttpService.buildRequest('GET', path, correlationId, userId);

            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                String errorMsg = ProspectingHttpService.parseErrorResponse(res);
                System.debug(LoggingLevel.WARN, 'getProspectDiscoveryStatus error: ' + errorMsg);
                throw createHandledException(errorMsg);
            }

            return res.getBody();

        } catch (AuraHandledException ahe) {
            logError('DashboardController.getProspectDiscoveryStatus', 'GET', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DashboardController.getProspectDiscoveryStatus – ' + e.getMessage());
            logError('DashboardController.getProspectDiscoveryStatus', 'GET', correlationId, e.getMessage());
            throw createHandledException('Error fetching prospect status: ' + e.getMessage());
        }
    }

    /**
     * @description Adds a prospect lead into Salesforce, calls Azure manual company ingestion,
     *              and inserts a corresponding Lead record with State/Country Picklist support.
     *              Checks for duplicates across all users in Salesforce before making callout.
     *              POST /v1/user/companies/manual
     */
    @AuraEnabled
    public static String addProspectCompany(String name, String website, String city, String state) {
        if (String.isBlank(name)) {
            throw createHandledException('Company name is required.');
        }

        String userId        = UserInfo.getUserId();
        String correlationId = generateCorrelationId();
        String cleanWebsite  = String.isNotBlank(website) ? website.trim() : null;
        String cleanName     = name.trim();

        try {
            // 1. CHECK FOR PREVIOUSLY SUBMITTED COMPANY ACROSS ALL USERS
            AI_Navigator_Company__c existingCompany = findDuplicateCompany(cleanName, cleanWebsite);

            if (existingCompany != null) {
                String ownerName = (existingCompany.Owner != null && String.isNotBlank(existingCompany.Owner.Name))
                    ? existingCompany.Owner.Name
                    : 'another user';
                throw createHandledException('This company has already been submitted by ' + ownerName + '.');
            }

            // 2. MAKE CALLOUT FIRST (Before any DML occurs)
            String path = '/v1/user/companies/manual';
            HttpRequest req = AzureHttpService.buildRequest('POST', path, correlationId, userId);

            Map<String, Object> payload = new Map<String, Object>{
                'name'         => cleanName,
                'website'      => cleanWebsite,
                'city'         => String.isNotBlank(city) ? city.trim() : null,
                'state'        => String.isNotBlank(state) ? state.trim() : null,
                'stage'        => 'PreCall',
                'clientType'   => 'Prospect',
                'salesforceId' => null
            };
            req.setBody(JSON.serialize(payload));

            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() < 200 || res.getStatusCode() >= 300) {
                throw createHandledException('Azure manual creation failed: ' + AzureHttpService.parseErrorResponse(res));
            }

            // 3. PARSE AZURE RESPONSE
            String azureCompanyId = null;
            if (String.isNotBlank(res.getBody())) {
                try {
                    Map<String, Object> resMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                    if (resMap.containsKey('azureCompanyId')) {
                        azureCompanyId = (String) resMap.get('azureCompanyId');
                    } else if (resMap.containsKey('companyId')) {
                        azureCompanyId = (String) resMap.get('companyId');
                    } else if (resMap.containsKey('id')) {
                        azureCompanyId = (String) resMap.get('id');
                    }
                } catch (Exception parseEx) {
                    System.debug(LoggingLevel.WARN, 'Could not parse response for Azure ID: ' + parseEx.getMessage());
                }
            }

            // 4. PERFORM DML (Insert new Company)
            AI_Navigator_Company__c company = new AI_Navigator_Company__c(
                Name                 = cleanName,
                Website__c           = cleanWebsite,
                City__c              = String.isNotBlank(city) ? city.trim() : null,
                State__c             = String.isNotBlank(state) ? state.trim() : null,
                Stage_List__c        = 'PreCall',
                Client_Type_List__c  = 'Prospect',
                Status__c            = 'processing',
                Azure_Company_Id__c  = azureCompanyId,
                OwnerId              = userId,
                Correlation_Id__c    = correlationId
            );
            insert company;

            // 5. CREATE CORRESPONDING LEAD WITH SAFE STATE PICKLIST HANDLING
            Lead newLead = new Lead(
                LastName  = cleanName,
                Company   = cleanName,
                Website   = cleanWebsite,
                City      = String.isNotBlank(city) ? city.trim() : null,
                Status    = 'Open - Not Contacted',
                AIN_Id__c = company.Id
            );
            populateLeadAddress(newLead, state);
            insert newLead;

            return JSON.serialize(new Map<String, Object>{
                'success'        => true,
                'companyId'      => company.Id,
                'azureCompanyId' => azureCompanyId,
                'correlationId'  => correlationId,
                'name'           => company.Name,
                'city'           => company.City__c,
                'state'          => company.State__c,
                'stage'          => company.Stage_List__c,
                'clientType'     => company.Client_Type_List__c,
                'status'         => company.Status__c,
                'createdAt'      => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
            });

        } catch (AuraHandledException ahe) {
            logError('DashboardController.addProspectCompany', 'POST', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DashboardController.addProspectCompany – ' + e.getMessage());
            logError('DashboardController.addProspectCompany', 'POST', correlationId, e.getMessage());
            throw createHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static String getProspectFilterConfigs() {
        User u = [SELECT Prospecting_Group__c FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        String userGroup = String.isNotBlank(u.Prospecting_Group__c) ? u.Prospecting_Group__c : 'Default';

        List<AI_Navigator_Prospect_Filter_Option__mdt> records = [
            SELECT Label, DeveloperName, Category__c, API_Value__c, Sort_Order__c, User_Group__c
            FROM   AI_Navigator_Prospect_Filter_Option__mdt
            WHERE  Is_Active__c = true
            AND    (User_Group__c = :userGroup OR User_Group__c = 'Default')
            ORDER BY Sort_Order__c ASC NULLS LAST, Label ASC
        ];

        Map<String, List<Map<String, Object>>> grouped = new Map<String, List<Map<String, Object>>>{
            'Revenue'     => new List<Map<String, Object>>(),
            'Employees'   => new List<Map<String, Object>>(),
            'Company_Age' => new List<Map<String, Object>>(),
            'State'       => new List<Map<String, Object>>(),
            'Industry'    => new List<Map<String, Object>>(),
            'Signal'      => new List<Map<String, Object>>()
        };

        for (AI_Navigator_Prospect_Filter_Option__mdt opt : records) {
            if (grouped.containsKey(opt.Category__c)) {
                grouped.get(opt.Category__c).add(new Map<String, Object>{
                    'id'      => opt.API_Value__c,
                    'label'   => opt.Label,
                    'checked' => false
                });
            }
        }

        return JSON.serialize(grouped);
    }

    // ── Duplicate Query Helper ───────────────────────────────────────────────
    private static AI_Navigator_Company__c findDuplicateCompany(String companyName, String website) {
        if (String.isNotBlank(website)) {
            String cleanWeb = website.trim();
            String domain = normalizeWebsite(cleanWeb);

            List<AI_Navigator_Company__c> matches = [
                SELECT Id, Name, Website__c, OwnerId, Owner.Name
                FROM   AI_Navigator_Company__c
                WHERE  Website__c = :cleanWeb
                   OR  Website__c = :domain
                   OR  Website__c = :('https://' + domain)
                   OR  Website__c = :('https://www.' + domain)
                   OR  Website__c = :('http://' + domain)
                   OR  Website__c = :('http://' + domain)
                LIMIT 1
            ];

            if (!matches.isEmpty()) {
                return matches[0];
            }
        }

        if (String.isNotBlank(companyName)) {
            String cleanName = companyName.trim();
            List<AI_Navigator_Company__c> matches = [
                SELECT Id, Name, Website__c, OwnerId, Owner.Name
                FROM   AI_Navigator_Company__c
                WHERE  Name = :cleanName
                LIMIT 1
            ];

            if (!matches.isEmpty()) {
                return matches[0];
            }
        }

        return null;
    }

    private static String normalizeWebsite(String web) {
        if (String.isBlank(web)) return '';
        return web.trim().toLowerCase()
            .replaceAll('^https?://', '')
            .replaceAll('^www\\.', '')
            .replaceAll('/.*$', '');
    }

    // ── Safe Address Mapping Helper ──────────────────────────────────────────
    private static void populateLeadAddress(Lead leadRecord, String stateInput) {
        if (String.isBlank(stateInput)) {
            leadRecord.Country = 'United States';
            return;
        }

        String inputUpper = stateInput.trim().toUpperCase();

        if (STATE_CODE_TO_NAME.containsKey(inputUpper)) {
            leadRecord.Country = 'US';
            leadRecord.State   = inputUpper;
        } else {
            leadRecord.Country = 'United States';
            leadRecord.State   = stateInput.trim();
        }
    }

    // -------------------------------------------------------------------------
    // Helper Methods
    // -------------------------------------------------------------------------
    private static HttpResponse azureCallout(String method, String path, Map<String, Object> body, Integer timeoutMs) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CRED + path);
        req.setMethod(method);
        req.setTimeout(timeoutMs);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-Correlation-Id', generateCorrelationId());
        if (body != null && !body.isEmpty()) { req.setBody(JSON.serialize(body)); }
        return new Http().send(req);
    }

    private static void handleCalloutResponse(HttpResponse res, String operation, String azureId) {
        Integer statusCode = res.getStatusCode();
        if (statusCode >= 200 && statusCode < 300) { return; }

        String correlationId = res.getHeader('X-Correlation-Id');
        String errorMsg;

        if (statusCode == 400) { 
            errorMsg = operation + ': Validation error (400). Azure Id: ' + azureId; 
        } else if (statusCode == 401) { 
            errorMsg = operation + ': Authentication failed (401). Check Named Credential token.'; 
        } else if (statusCode == 403) { 
            errorMsg = operation + ': Forbidden (403).'; 
        } else if (statusCode == 404) { 
            errorMsg = operation + ': Company not found on Azure (404). Azure Id: ' + azureId; 
        } else if (statusCode == 409) { 
            errorMsg = operation + ': Conflict (409). ' + res.getBody(); 
        } else if (statusCode == 429) { 
            errorMsg = operation + ': Rate limited (429). Retry-After: ' + res.getHeader('Retry-After'); 
        } else if (statusCode == 500) { 
            errorMsg = operation + ': Azure internal error (500). CorrelationId: ' + correlationId; 
        } else if (statusCode == 502 || statusCode == 503) { 
            errorMsg = operation + ': Upstream unavailable (' + statusCode + ').'; 
        } else if (statusCode == 504) { 
            errorMsg = operation + ': Gateway timeout (504). Verify state before retrying.'; 
        } else { 
            errorMsg = operation + ': Unexpected status (' + statusCode + '). CorrelationId: ' + correlationId; 
        }

        System.debug(LoggingLevel.ERROR, 'DashboardController.' + errorMsg);

        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = operation,
                Endpoint_Name__c    = 'DashboardController.' + operation,
                Status__c           = 'Failed',
                HTTP_Status_Code__c = statusCode,
                Correlation_ID__c   = correlationId,
                Error_Message__c    = errorMsg
            );
        } catch (DmlException de) {
            System.debug(LoggingLevel.WARN, 'DashboardController: failed to write request log: ' + de.getMessage());
        }

        if (statusCode != 404) {
            throw createHandledException(errorMsg);
        }
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
        return 'SF-' + String.valueOf(DateTime.now().getTime()) + '-' 
            + EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 8);
    }

    private static AuraHandledException createHandledException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
/**
 * @description DashboardController — Pure Salesforce database updates, pipeline polling,
 *              sharing actions, manual company submission, and Azure AI Prospecting Discovery.
 * @group AI Navigator - Apex
 */
public with sharing class DashboardController {

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

            // Format body with filters object (avoiding double-wrapping)
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
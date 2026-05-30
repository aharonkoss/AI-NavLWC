/**
 * @description DashboardController — real SOQL, no MockDataProvider.
 *
 *   Company__c fields (verified from org):
 *     Name, City__c, State__c, Website__c, Status__c, Stage__c,
 *     Client_Type__c, Azure_Company_Id__c, Is_Hidden__c,
 *     OwnerId, CreatedDate
 *
 *   Signal__c fields (verified from org):
 *     Company__c (MD lookup), Detected_At__c, Headline__c,
 *     Impact__c, Is_New__c, Priority__c, Name (auto-number),
 *     Signal_Type__c, Source__c
 *
 *   Soft-delete: uses Is_Hidden__c = true (not Status__c = 'hidden')
 *
 * @group AI Navigator - Apex
 * @last-modified 2026-04-27
 */
public with sharing class DashboardController {

    private static final String NAMED_CRED  = 'callout:AI_Navigator_Azure';
    private static final Integer TIMEOUT_MS = 30000;

    // -------------------------------------------------------------------------
    // getDashboardStats
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getDashboardStats() {
        try {
            AggregateResult[] rows = [
                SELECT Status__c status, COUNT(Id) cnt
                FROM   Company__c
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
                if      (st == 'processing') { processing = cnt; }
                else if (st == 'completed')  { completed  = cnt; }
            }

            return JSON.serialize(new Map<String, Object>{
                'totalCompanies' => totalCompanies,
                'processing'     => processing,
                'completed'      => completed,
                'opened'         => opened
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching dashboard stats: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // getCompanies
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getCompanies() {
        try {
            List<Company__c> records = [
                SELECT Id, Name, City__c, State__c, Website__c,
                       Status__c, Stage__c, Client_Type__c,
                       Azure_Company_Id__c, CreatedDate, Shared_By_Name__c,
                       (SELECT Id FROM Shared_With_Users__r) // To check if shared
                FROM   Company__c
                WHERE  OwnerId = :UserInfo.getUserId()
                AND    Is_Hidden__c = false
                ORDER BY CreatedDate DESC
                LIMIT  500
            ];

            List<Map<String, Object>> companies = new List<Map<String, Object>>();
            for (Company__c c : records) {
                companies.add(new Map<String, Object>{
                    'id'             => c.Id,
                    'companyId'      => c.Id,
                    'azureCompanyId' => c.Azure_Company_Id__c,
                    'name'           => c.Name,
                    'city'           => c.City__c,
                    'state'          => c.State__c,
                    'website'        => c.Website__c,
                    'status'         => c.Status__c?.toLowerCase(),
                    'stage'          => c.Stage__c,
                    'clientType'     => c.Client_Type__c,
                    'createdAt'      => c.CreatedDate,
                    'sharedByName'   => c.Shared_By_Name__c,
                    'isShared'       => !c.Shared_With_Users__r.isEmpty()
                });
            }
            return JSON.serialize(companies);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching companies: ' + e.getMessage());
        }
    }
@AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getTeammates() {
        List<Map<String, String>> teammates = new List<Map<String, String>>();
        // Find users in same profile
        Id currentProfileId = UserInfo.getProfileId();
        for (User u : [SELECT Id, Name FROM User WHERE ProfileId = :currentProfileId AND IsActive = true AND Id != :UserInfo.getUserId()]) {
            teammates.add(new Map<String, String>{ 'value' => u.Id, 'label' => u.Name });
        }
        return teammates;
    }

    @AuraEnabled
    public static String shareCompanies(List<String> companyIds, String targetUserId) {
        try {
            List<Company__c> originalRecords = [
                SELECT Id, Name, City__c, State__c, Website__c, Status__c, Stage__c, 
                       Client_Type__c, Azure_Company_Id__c 
                FROM Company__c WHERE Id IN :companyIds
            ];
            
            List<String> azureIds = new List<String>();
            List<Company__c> clones = new List<Company__c>();
            
            for (Company__c original : originalRecords) {
                if (String.isNotBlank(original.Azure_Company_Id__c)) {
                    azureIds.add(original.Azure_Company_Id__c);
                }
                
                Company__c clone = original.clone(false, true, false, false);
                clone.OwnerId = targetUserId;
                clone.Assigned_User__c = targetUserId;
                clone.Shared_By_Name__c = UserInfo.getName();
                clones.add(clone);
            }
            
            // 1. Azure Callout
            HttpRequest req = AzureHttpService.buildRequest('POST', '/v1/user/companies/share', 'SHARE-' + DateTime.now().getTime(), UserInfo.getUserId());
            req.setBody(JSON.serialize(new Map<String, Object>{
                'companyIds' => azureIds,
                'salesforceIds' => companyIds,
                'targetUserId' => targetUserId
            }));
            
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() != 200 && res.getStatusCode() != 201) {
                throw new AuraHandledException('Azure Sharing Failed: ' + AzureHttpService.parseErrorResponse(res));
            }

            // 2. Insert Clones
            insert clones;
            
            // 3. Create Shared_Company__c junction records
            List<Shared_Company__c> junctions = new List<Shared_Company__c>();
            for (Integer i = 0; i < originalRecords.size(); i++) {
                junctions.add(new Shared_Company__c(
                    Source_Company__c = originalRecords[i].Id,
                    Target_Company__c = clones[i].Id,
                    User__c = targetUserId
                ));
            }
            insert junctions;

            return '{"success": true, "message": "Companies shared successfully"}';
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=false)
    public static List<Map<String, String>> getSharedUsers(String companyId) {
        List<Map<String, String>> sharedUsers = new List<Map<String, String>>();
        for (Shared_Company__c sc : [SELECT Id, User__r.Name, User__c FROM Shared_Company__c WHERE Source_Company__c = :companyId]) {
            sharedUsers.add(new Map<String, String>{ 'id' => sc.Id, 'name' => sc.User__r.Name });
        }
        return sharedUsers;
    }

    @AuraEnabled
    public static void unshareCompany(String sharedCompanyRecordId) {
        try {
            Shared_Company__c sc = [SELECT Id, Source_Company__r.Azure_Company_Id__c, Target_Company__c, User__c 
                                    FROM Shared_Company__c WHERE Id = :sharedCompanyRecordId LIMIT 1];
            
            // 1. Azure Callout
            HttpRequest req = AzureHttpService.buildRequest('POST', '/v1/user/companies/unshare', 'UNSHARE-' + DateTime.now().getTime(), UserInfo.getUserId());
            req.setBody(JSON.serialize(new Map<String, Object>{
                'companyIds' => new List<String>{ sc.Source_Company__r.Azure_Company_Id__c },
                'targetUserId' => sc.User__c
            }));
            
            new Http().send(req);

            // 2. Delete the recipient's clone
            delete new Company__c(Id = sc.Target_Company__c);
            
            // 3. Delete the junction
            delete sc;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // getSignals — Signal__c rows for one company
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getSignals(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required');
        }
        try {
            List<Signal__c> rows = [
                SELECT Id, Name, Signal_Type__c, Headline__c,
                       Priority__c, Impact__c, Source__c,
                       Is_New__c, Detected_At__c
                FROM   Signal__c
                WHERE  Company__c = :companyId
                ORDER BY Detected_At__c DESC NULLS LAST
                LIMIT  200
            ];

            List<Map<String, Object>> signals = new List<Map<String, Object>>();
            for (Signal__c s : rows) {
                signals.add(new Map<String, Object>{
                    'id'         => s.Id,
                    'signalName' => s.Name,
                    'signalType' => s.Signal_Type__c,
                    'headline'   => s.Headline__c,
                    'priority'   => s.Priority__c,
                    'impact'     => s.Impact__c,
                    'source'     => s.Source__c,
                    'isNew'      => s.Is_New__c,
                    'detectedAt' => s.Detected_At__c,
                    // Map to keys expected by dashboard.js / companyDetailSignals.js
                    'signalCategory'    => s.Signal_Type__c,
                    'signalDescription' => s.Headline__c,
                    'eventDate'         => s.Detected_At__c
                });
            }
            return JSON.serialize(signals);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching signals: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // updateCompany — DML + Azure PUT
    // -------------------------------------------------------------------------
    @AuraEnabled
    public static String updateCompany(String companyId, String stage, String clientType) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required');
        }
        try {
            Company__c company = [
                SELECT Id, Azure_Company_Id__c, Stage__c, Client_Type__c
                FROM   Company__c
                WHERE  Id = :companyId
                AND    OwnerId = :UserInfo.getUserId()
                LIMIT  1
            ];

            Boolean changed = false;
            if (String.isNotBlank(stage) && stage != company.Stage__c) {
                company.Stage__c = stage;
                changed = true;
            }
            if (String.isNotBlank(clientType) && clientType != company.Client_Type__c) {
                company.Client_Type__c = clientType;
                changed = true;
            }
            if (changed) { update company; }

            if (String.isNotBlank(company.Azure_Company_Id__c)) {
                Map<String, Object> body = new Map<String, Object>();
                if (String.isNotBlank(stage))      { body.put('stage',      stage);      }
                if (String.isNotBlank(clientType)) { body.put('clientType', clientType); }
                HttpResponse res = azureCallout(
                    'PUT',
                    '/v1/user/companies/' + EncodingUtil.urlEncode(company.Azure_Company_Id__c, 'UTF-8'),
                    body, TIMEOUT_MS
                );
                handleCalloutResponse(res, 'updateCompany', company.Azure_Company_Id__c);
            }

            return JSON.serialize(new Map<String, Object>{
                'success'    => true,
                'companyId'  => companyId,
                'stage'      => stage,
                'clientType' => clientType
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw new AuraHandledException('Error updating company: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // deleteCompany — Azure /hide + Is_Hidden__c = true
    // -------------------------------------------------------------------------
    @AuraEnabled
    public static String deleteCompany(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required');
        }
        try {
            Company__c company = [
                SELECT Id, Azure_Company_Id__c, Is_Hidden__c
                FROM   Company__c
                WHERE  Id = :companyId
                AND    OwnerId = :UserInfo.getUserId()
                LIMIT  1
            ];

            if (String.isNotBlank(company.Azure_Company_Id__c)) {
                HttpResponse res = azureCallout(
                    'POST',
                    '/v1/user/companies/' + EncodingUtil.urlEncode(company.Azure_Company_Id__c, 'UTF-8') + '/hide',
                    new Map<String, Object>(), TIMEOUT_MS
                );
                handleCalloutResponse(res, 'deleteCompany', company.Azure_Company_Id__c);
            }

            company.Is_Hidden__c = true;
            update company;

            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting company: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // retryCompany — Azure /retry + Status__c = 'pending'
    // -------------------------------------------------------------------------
    @AuraEnabled
    public static String retryCompany(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required');
        }
        try {
            Company__c company = [
                SELECT Id, Azure_Company_Id__c, Status__c
                FROM   Company__c
                WHERE  Id = :companyId
                AND    OwnerId = :UserInfo.getUserId()
                LIMIT  1
            ];

            if (company.Status__c?.toLowerCase() != 'failed') {
                throw new AuraHandledException(
                    'Only failed companies can be retried. Current status: ' + company.Status__c
                );
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
            throw new AuraHandledException('Error retrying company: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // getCompanyInfo — lightweight header (backward-compat)
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getCompanyInfo(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required');
        }
        try {
            Company__c c = [
                SELECT Id, Name, City__c, State__c, Website__c,
                       Status__c, Stage__c, Client_Type__c,
                       Azure_Company_Id__c, CreatedDate
                FROM   Company__c
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
                'stage'          => c.Stage__c,
                'clientType'     => c.Client_Type__c,
                'createdAt'      => c.CreatedDate
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching company info: ' + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // getCallPlan — stub; real data from CompanyDetailController.getAiResearch
    // -------------------------------------------------------------------------
    @AuraEnabled(cacheable=false)
    public static String getCallPlan(String companyId) {
        return JSON.serialize(new Map<String, Object>{
            'companyId' => companyId,
            'callPlan'  => null,
            'message'   => 'Use CompanyDetailController.getAiResearch for full call plan data.'
        });
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private static HttpResponse azureCallout(
        String method, String path,
        Map<String, Object> body, Integer timeoutMs
    ) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CRED + path);
        req.setMethod(method);
        req.setTimeout(timeoutMs);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-Correlation-Id', generateCorrelationId());
        if (body != null && !body.isEmpty()) {
            req.setBody(JSON.serialize(body));
        }
        return new Http().send(req);
    }

    @TestVisible
    private static void handleCalloutResponse(HttpResponse res, String operation, String azureId) {
        Integer statusCode = res.getStatusCode();
        if (statusCode >= 200 && statusCode < 300) { return; }

        String correlationId = res.getHeader('X-Correlation-Id');
        String errorMsg;

        if      (statusCode == 400) { errorMsg = operation + ': Validation error (400). Azure Id: ' + azureId; }
        else if (statusCode == 401) { errorMsg = operation + ': Authentication failed (401). Check Named Credential token.'; }
        else if (statusCode == 403) { errorMsg = operation + ': Forbidden (403).'; }
        else if (statusCode == 404) { errorMsg = operation + ': Company not found on Azure (404). Azure Id: ' + azureId; }
        else if (statusCode == 409) { errorMsg = operation + ': Conflict (409). ' + res.getBody(); }
        else if (statusCode == 429) { errorMsg = operation + ': Rate limited (429). Retry-After: ' + res.getHeader('Retry-After'); }
        else if (statusCode == 500) { errorMsg = operation + ': Azure internal error (500). CorrelationId: ' + correlationId; }
        else if (statusCode == 502 || statusCode == 503) { errorMsg = operation + ': Upstream unavailable (' + statusCode + ').'; }
        else if (statusCode == 504) { errorMsg = operation + ': Gateway timeout (504). Verify state before retrying.'; }
        else                        { errorMsg = operation + ': Unexpected status (' + statusCode + '). CorrelationId: ' + correlationId; }

        System.debug(LoggingLevel.ERROR, 'DashboardController.' + errorMsg);

        try {
             insert new Azure_Request_Log__c(
                HTTP_Method__c      = operation,
                Endpoint_Name__c    = operation,
                Status__c           = 'Error',
                HTTP_Status_Code__c = statusCode,
                Correlation_ID__c   = correlationId,
                Error_Message__c    = errorMsg
            );
        } catch (DmlException de) {
            System.debug(LoggingLevel.WARN, 'DashboardController: failed to write request log: ' + de.getMessage());
        }

        if (statusCode != 404) {
            throw new AuraHandledException(errorMsg);
        }
    }

    private static String generateCorrelationId() {
        return EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 8)
            + '-' + String.valueOf(DateTime.now().getTime());
    }
}
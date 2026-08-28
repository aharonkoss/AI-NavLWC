/**
 * @description Controller for the companyDetailInsights LWC.
 *              Handles Insights, Insights PDF download, and Notes CRUD operations.
 * @group       AI Navigator - Apex
 * @last-modified 2026-08-27
 */
public with sharing class CompanyDetailInsightsController {

    private static AuraHandledException createHandledException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message); // Required for LWC to display the actual message instead of "Script-thrown exception"
        return ex;
    }

    private static AI_Navigator_Company__c getCompanyRecord(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required.');
        }

        List<AI_Navigator_Company__c> companies = [
            SELECT Id, Azure_Company_Id__c, Correlation_Id__c, Name
            FROM AI_Navigator_Company__c
            WHERE Id = :companyId
            LIMIT 1
        ];

        if (companies.isEmpty()) {
            throw createHandledException('Company record not found: ' + companyId);
        }

        if (String.isBlank(companies[0].Azure_Company_Id__c)) {
            throw createHandledException('Azure Company ID is missing for this company.');
        }

        return companies[0];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GET Insights
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled
    public static String getInsights(String companyId) {
        if (String.isBlank(companyId)) {
            throw createHandledException('companyId is required.');
        }

        try {
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Correlation_Id__c, Name
                FROM AI_Navigator_Company__c
                WHERE Id = :companyId
                LIMIT 1
            ];

            if (companies.isEmpty() || String.isBlank(companies[0].Azure_Company_Id__c)) {
                return getMockInsights();
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;
            String correlationId  = companies[0].Correlation_Id__c;
            String userId         = UserInfo.getUserId();
            String path           = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/insights';

            HttpRequest req  = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            Integer statusCode = res.getStatusCode();
            String  body       = res.getBody();

            try {
                insert new AI_Navigator_Request_Log__c(
                    HTTP_Method__c      = 'GET',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.getInsights',
                    Response_Body__c    = body,
                    Status__c           = (statusCode == 200) ? 'Success' : 'Failed',
                    HTTP_Status_Code__c = statusCode,
                    Correlation_ID__c   = correlationId,
                    Error_Message__c    = (statusCode != 200) ? 'HTTP ' + statusCode : null
                );
            } catch (DmlException logEx) {
                System.debug(LoggingLevel.ERROR, 'Log failed: ' + logEx.getMessage());
            }

            if (statusCode == 200 && String.isNotBlank(body) && body != '{}' && body != 'null') {
                return body;
            }

            return getMockInsights();

        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            return getMockInsights();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GET Insights PDF Download URL
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String getInsightsPdfDownloadUrl(String companyId) {
        try {
            AI_Navigator_Company__c comp = getCompanyRecord(companyId);
            String azureCompanyId = comp.Azure_Company_Id__c;
            String correlationId  = comp.Correlation_Id__c;
            String userId         = UserInfo.getUserId();
            
            String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/insights/pdf';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('GET /insights/pdf').left(80),
                    HTTP_Method__c      = 'GET',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.getInsightsPdfDownloadUrl',
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
                throw createHandledException('Insights PDF fetch failed (HTTP ' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw createHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. GET Notes — GET /v1/user/companies/{companyId}/notes
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String getNotes(String companyId) {
        try {
            AI_Navigator_Company__c comp = getCompanyRecord(companyId);
            String azureCompanyId = comp.Azure_Company_Id__c;
            String correlationId  = comp.Correlation_Id__c;
            String userId         = UserInfo.getUserId();

            String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/notes';

            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('GET /notes').left(80),
                    HTTP_Method__c      = 'GET',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.getNotes',
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
            } else if (res.getStatusCode() == 404) {
                return JSON.serialize(new Map<String, Object>{
                    'count' => 0,
                    'notes' => new List<Object>()
                });
            } else {
                throw createHandledException('Fetch notes failed (HTTP ' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw createHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CREATE Note — POST /v1/user/companies/{companyId}/notes
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String createNote(String companyId, String title, String content, String sourceTab, String sourceSection) {
        try {
            AI_Navigator_Company__c comp = getCompanyRecord(companyId);
            String azureCompanyId = comp.Azure_Company_Id__c;
            String correlationId  = comp.Correlation_Id__c;
            String userId         = UserInfo.getUserId();

            String path = '/v1/user/companies/' + EncodingUtil.urlEncode(azureCompanyId, 'UTF-8') + '/notes';

            Map<String, Object> payload = new Map<String, Object>{
                'title'         => title,
                'content'       => content,
                'sourceTab'     => String.isNotBlank(sourceTab) ? sourceTab : 'Discovery Call Insights',
                'sourceSection' => String.isNotBlank(sourceSection) ? sourceSection : ''
            };

            HttpRequest req = AzureHttpService.buildRequest('POST', path, correlationId, userId);
            req.setBody(JSON.serialize(payload));
            req.setHeader('Content-Type', 'application/json');

            HttpResponse res = new Http().send(req);

            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('POST /notes').left(80),
                    HTTP_Method__c      = 'POST',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.createNote',
                    Response_Body__c    = res.getBody(),
                    Status__c           = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                    HTTP_Status_Code__c = res.getStatusCode(),
                    Correlation_ID__c   = correlationId
                );
            } catch (Exception logEx) {
                System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
            }

            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return String.isNotBlank(res.getBody()) ? res.getBody() : '{"success":true}';
            } else {
                throw createHandledException('Create note failed (HTTP ' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw createHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. EDIT Note — PUT /v1/user/notes/{noteId}
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String updateNote(String noteId, String title, String content) {
        if (String.isBlank(noteId)) {
            throw createHandledException('noteId parameter is blank or missing.');
        }

        try {
            String correlationId = AiNavigatorEventService.generateCorrelationId();
            String userId        = UserInfo.getUserId();
            String path          = '/v1/user/notes/' + EncodingUtil.urlEncode(noteId.trim(), 'UTF-8');

            Map<String, Object> payload = new Map<String, Object>{
                'title'   => title,
                'content' => content
            };

            HttpRequest req = AzureHttpService.buildRequest('PUT', path, correlationId, userId);
            req.setBody(JSON.serialize(payload));
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('Accept', 'application/json');

            HttpResponse res = new Http().send(req);

            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('PUT /notes/' + noteId).left(80),
                    HTTP_Method__c      = 'PUT',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.updateNote',
                    Response_Body__c    = res.getBody(),
                    Status__c           = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                    HTTP_Status_Code__c = res.getStatusCode(),
                    Correlation_ID__c   = correlationId,
                    Error_Message__c    = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? null : ('HTTP ' + res.getStatusCode() + ': ' + res.getBody()).left(32768)
                );
            } catch (Exception logEx) {
                System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
            }

            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return String.isNotBlank(res.getBody()) ? res.getBody() : '{"success":true}';
            } else {
                throw createHandledException('Update note failed (HTTP ' + res.getStatusCode() + ' for noteId ' + noteId + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw createHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. DELETE Note — DELETE /v1/user/notes/{noteId}
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String deleteNote(String noteId) {
        if (String.isBlank(noteId)) {
            throw createHandledException('noteId parameter is blank or missing.');
        }

        try {
            String correlationId = AiNavigatorEventService.generateCorrelationId();
            String userId        = UserInfo.getUserId();
            String path          = '/v1/user/notes/' + EncodingUtil.urlEncode(noteId.trim(), 'UTF-8');

            HttpRequest req = AzureHttpService.buildRequest('DELETE', path, correlationId, userId);
            req.setHeader('Accept', 'application/json');

            HttpResponse res = new Http().send(req);

            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('DELETE /notes/' + noteId).left(80),
                    HTTP_Method__c      = 'DELETE',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.deleteNote',
                    Response_Body__c    = res.getBody(),
                    Status__c           = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed',
                    HTTP_Status_Code__c = res.getStatusCode(),
                    Correlation_ID__c   = correlationId,
                    Error_Message__c    = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? null : ('HTTP ' + res.getStatusCode() + ': ' + res.getBody()).left(32768)
                );
            } catch (Exception logEx) {
                System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
            }

            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return '{"success":true}';
            } else {
                throw createHandledException('Delete note failed (HTTP ' + res.getStatusCode() + ' for noteId ' + noteId + '): ' + res.getBody());
            }

        } catch (Exception e) {
            throw createHandledException(e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mock Fallback
    // ─────────────────────────────────────────────────────────────────────────
    private static String getMockInsights() {
        Map<String, Object> companyProfile = new Map<String, Object>{
            'businessType'       => 'Turnkey fueling infrastructure construction and compliance services provider for fueling retailers and service stations (B2B) in East Texas, Arkansas, Mississippi, Alabama, and parts of Louisiana.',
            'keyCharacteristics' => 'Family-founded, Frankston, TX-based single-location firm with deep regional roots; highly certified, lean team (3 key employees); growth focus; serves multi-state B2B market; specializes in repairs, installs, regulatory compliance, and large-scale fuel system projects using GPS-equipped service fleet.'
        };

        Map<String, Object> callStrategy = new Map<String, Object>{
            'primaryObjective'    => 'Thank you for meeting today. I\'ve been closely following T & P Fueling Solutions\' ongoing growth, recent hiring initiatives, and your leadership in fueling infrastructure compliance across the region. I\'d like to focus our discussion on aligning financial strategies with your upcoming expansion and regulatory milestones to help you capitalize on new opportunities while minimizing risk.',
            'keyFocusAreas'       => new List<String>{
                'Supporting recruitment, onboarding, and benefits funding to sustain workforce expansion',
                'Structuring financing for EV charging, safety compliance, and large-scale infrastructure projects',
                'Deepening the advisory relationship around multi-generational family business needs and geographic growth'
            },
            'relationshipApproach'=> 'Take a consultative, relationship-focused stance—demonstrate knowledge of T&P\'s legacy, leadership priorities, and evolving market environment. Emphasize proactive risk mitigation, cross-jurisdictional scalability, and the value of tailored banking solutions for both operational and strategic needs.',
            'followUpActions'     => new List<String>{
                'Send executive summary & structured working capital outline within 24 hours',
                'Schedule advisory session with CFO & Managing Partner',
                'Deliver specialized equipment financing models'
            }
        };

        List<Map<String, Object>> insights = new List<Map<String, Object>>{
            new Map<String, Object>{
                'title'              => 'Equipment Financing & Fleet Upgrade Window',
                'category'           => 'Actionable',
                'priority'           => 'High',
                'rawDataTrigger'     => 'Strategic Intelligence: Multi-state fleet expansion planned with new diagnostic equipment.',
                'insight'            => 'The company is actively planning fleet and equipment upgrades to service expanding regional utility contracts. This creates an immediate equipment leasing & term-lending opportunity.',
                'businessNeed'       => 'Capital for precision fueling installation vehicles and diagnostic testing equipment.',
                'discoveryQuestions' => new List<String>{
                    'What is your projected timeline for acquiring additional fleet units?',
                    'How are you currently structuring your heavy equipment leases?'
                },
                'advisoryOpportunity'=> 'Position structured equipment finance alongside a revolving operating line to preserve cash flow.',
                'expectedOutcome'    => 'Joint proposal meeting with Managing Partners to review equipment financing packages.'
            }
        };

        Map<String, Object> discoveryCallPlan = new Map<String, Object>{
            'companyProfile' => companyProfile,
            'callStrategy'   => callStrategy,
            'insights'       => insights
        };

        return JSON.serialize(new Map<String, Object>{
            'discoveryCallPlan' => discoveryCallPlan
        });
    }
}
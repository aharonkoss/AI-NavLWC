/**
 * @description Controller for the companyDetailInsights LWC.
 *              Calls GET /v1/user/companies/{azureCompanyId}/insights
 *              and GET /v1/user/companies/{azureCompanyId}/insights/pdf.
 * @group       AI Navigator - Apex
 * @last-modified 2026-08-26
 */
public with sharing class CompanyDetailInsightsController {

    /**
     * @description Fetches AI-generated insights for a company.
     * @param  companyId  Salesforce Company__c.Id
     * @return JSON string of insights payload
     */
    @AuraEnabled
    public static String getInsights(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required.');
        }

        try {
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c, Name
                FROM AI_Navigator_Company__c
                WHERE Id = :companyId
                LIMIT 1
            ];

            if (companies.isEmpty() || String.isBlank(companies[0].Azure_Company_Id__c)) {
                return getMockInsights();
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;
            String correlationId  = AiNavigatorEventService.generateCorrelationId();
            String userId         = UserInfo.getUserId();
            String path           = 'v1/user/companies/' + azureCompanyId + '/insights';

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

    /**
     * @description Fetches the Insights PDF download URL from Azure.
     *              GET /v1/user/companies/{azureCompanyId}/insights/pdf
     * @param  companyId  Salesforce Company__c.Id
     * @return JSON string containing downloadUrl, fileName, and expiresAt
     */
    @AuraEnabled
    public static String getInsightsPdfDownloadUrl(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required.');
        }

        Long startTime = System.currentTimeMillis();
        String correlationId = AiNavigatorEventService.generateCorrelationId();
        String path = '';

        try {
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :companyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                throw new AuraHandledException('Company not found: ' + companyId);
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;
            if (String.isBlank(azureCompanyId)) {
                throw new AuraHandledException('Company Azure ID is missing.');
            }

            path = '/v1/user/companies/' + azureCompanyId + '/insights/pdf';
            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, UserInfo.getUserId());
            HttpResponse res = new Http().send(req);

            Long durationMs = System.currentTimeMillis() - startTime;
            try {
                insert new AI_Navigator_Request_Log__c(
                    Name                = ('GET /insights/pdf (' + durationMs + 'ms)').left(80),
                    HTTP_Method__c      = 'GET',
                    Endpoint_Name__c    = path.left(255),
                    Request_Timestamp__c= DateTime.now(),
                    Response_Body__c    = ('[Duration: ' + durationMs + ' ms]\n' + res.getBody()).left(32768),
                    HTTP_Status_Code__c = res.getStatusCode(),
                    Status__c           = (res.getStatusCode() == 200) ? 'Success' : 'Failed',
                    Correlation_ID__c   = correlationId
                );
            } catch (Exception logEx) {
                System.debug(LoggingLevel.ERROR, 'Log failed: ' + logEx.getMessage());
            }

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                throw new AuraHandledException('Insights PDF fetch failed (' + res.getStatusCode() + '): ' + res.getBody());
            }

        } catch (Exception e) {
            Long durationMs = System.currentTimeMillis() - startTime;
            insert new AI_Navigator_Request_Log__c(
                Name                = ('GET /insights/pdf Error (' + durationMs + 'ms)').left(80),
                HTTP_Method__c      = 'GET',
                Endpoint_Name__c    = path.left(255),
                Request_Timestamp__c= DateTime.now(),
                Error_Message__c    = (e.getMessage() + '\n' + e.getStackTraceString()).left(32768),
                Status__c           = 'Failed',
                Correlation_ID__c   = correlationId
            );
            throw new AuraHandledException(e.getMessage());
        }
    }

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
                'businessNeed'       => 'Capital for specialized fueling installation vehicles and testing equipment.',
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
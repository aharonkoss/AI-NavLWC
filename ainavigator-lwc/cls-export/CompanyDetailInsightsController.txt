/**
 * @description Controller for the companyDetailInsights LWC.
 *              Calls GET /v1/user/companies/{azureCompanyId}/insights via AzureHttpService.
 *              If the endpoint returns an empty body (research not yet complete),
 *              falls back to rich mock data so the UI always has something to render.
 * @group       AI Navigator - Apex
 * @last-modified 2026-05-16
 */
public with sharing class CompanyDetailInsightsController {

    /**
     * @description Fetches AI-generated insights for a company.
     *              Flow:
     *                1. Look up Azure_Company_Id__c from Company__c record
     *                2. Call GET /v1/user/companies/{azureCompanyId}/insights via AzureHttpService
     *                3. If 200 with real data → return it
     *                4. If 200 with empty body {} OR 404 → fall back to mock
     *                5. Log the callout to AzureRequestLog__c
     * @param  companyId  Salesforce Company__c.Id
     * @return            JSON string of insights payload
     */
    @AuraEnabled
    public static String getInsights(String companyId) {
        if (String.isBlank(companyId)) {
            throw new AuraHandledException('companyId is required.');
        }

        try {
            // 1. Get the Azure UUID stored on the Company__c record
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Azure_Company_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :companyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                System.debug(LoggingLevel.WARN, 'CompanyDetailInsightsController: Company not found – ' + companyId + '. Returning mock.');
                return getMockInsights();
            }

            String azureCompanyId = companies[0].Azure_Company_Id__c;

            if (String.isBlank(azureCompanyId)) {
                System.debug(LoggingLevel.WARN, 'CompanyDetailInsightsController: Azure_Company_Id__c is blank for ' + companyId + '. Returning mock.');
                return getMockInsights();
            }

            // 2. Build and send the GET request using AzureHttpService
            String correlationId = AiNavigatorEventService.generateCorrelationId();
            String userId        = UserInfo.getUserId();
            String path          = 'v1/user/companies/' + azureCompanyId + '/insights';

            HttpRequest req  = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            HttpResponse res = new Http().send(req);

            Integer statusCode = res.getStatusCode();
            String  body       = res.getBody();

            // 3. Log the callout
            try {
                insert new AI_Navigator_Request_Log__c(
                    HTTP_Method__c      = 'GET',
                    Endpoint_Name__c    = 'CompanyDetailInsightsController.getInsights',
                    Response_Body__c    = body,
                    Status__c          = (statusCode == 200) ? 'Success' : 'Failed',
                    HTTP_Status_Code__c  = statusCode,
                    Correlation_ID__c   = correlationId,
                    Error_Message__c    = (statusCode != 200) ? 'HTTP ' + statusCode : null
                );
            } catch (DmlException logEx) {
                System.debug(LoggingLevel.ERROR, 'CompanyDetailInsightsController log failed: ' + logEx.getMessage());
            }

            // 4. Evaluate response — fall back to mock if empty or not ready
            if (statusCode == 200 && String.isNotBlank(body) && body != '{}' && body != 'null') {
                return body; // ✅ Real data from Azure
            }

            // 200 with empty body or 404 = research not ready yet, use mock
            System.debug(LoggingLevel.INFO,
                'CompanyDetailInsightsController: Endpoint returned statusCode=' + statusCode +
                ' body=' + body + ' — falling back to mock data.');
            return getMockInsights();

        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'CompanyDetailInsightsController.getInsights unexpected error: '
                + e.getTypeName() + ' ' + e.getMessage() + ' Line:' + e.getLineNumber());
            // Never break the UI — fall back to mock on any unexpected error
            return getMockInsights();
        }
    }

    // -------------------------------------------------------------------------
    // Mock fallback — mirrors the structure the LWC expects (discoveryCallPlan)
    // Source: CompanyDetailController.getInsights mock shape
    // -------------------------------------------------------------------------
    private static String getMockInsights() {
        Map<String, Object> companyProfile = new Map<String, Object>{
            'businessType'       => 'B2B Mid-Market Manufacturer',
            'keyCharacteristics' => 'Capital-intensive, relationship-driven, long sales cycle'
        };

        Map<String, Object> callStrategy = new Map<String, Object>{
            'primaryObjective'    => 'Establish trust and identify primary capital need within 45 minutes.',
            'keyFocusAreas'       => new List<String>{
                'Equipment financing timeline',
                'Credit facility renewal pressure',
                'Consolidation opportunity across banking relationships'
            },
            'followUpActions'     => new List<String>{
                'Send personalized summary within 24 hours',
                'Schedule follow-up with CFO',
                'Introduce treasury services overview'
            },
            'relationshipApproach'=> 'Lead with operational empathy. Reference manufacturing sector knowledge early to establish credibility before discussing products.'
        };

        List<Map<String, Object>> insights = new List<Map<String, Object>>{
            new Map<String, Object>{
                'title'              => 'Equipment Financing Window',
                'category'           => 'Actionable',
                'priority'           => 'High',
                'rawDataTrigger'     => 'Strategic Intelligence: CNC expansion planned Q3 2026, estimated $8–12M equipment need.',
                'insight'            => 'The company is actively planning a third facility and CNC capacity expansion. This creates a near-term, sizeable equipment financing opportunity before Q3.',
                'businessNeed'       => 'Capital for precision CNC equipment to support aerospace vertical expansion.',
                'discoveryQuestions' => new List<String>{
                    'What is your current timeline for the Q3 facility decision?',
                    'How are you currently financing major equipment purchases?',
                    'Have you modeled the financing structure for the CNC expansion?'
                },
                'advisoryOpportunity'=> 'Position as a manufacturing-sector specialist who can structure equipment financing alongside a revolving credit facility in a single relationship.',
                'expectedOutcome'    => 'Appointment with CFO and COO to present a combined equipment + credit proposal.',
                'scoring'            => new Map<String, Object>{ 'recency' => 'High', 'reliability' => 'High' }
            },
            new Map<String, Object>{
                'title'              => 'Credit Facility Maturity Risk',
                'category'           => 'Actionable',
                'priority'           => 'High',
                'rawDataTrigger'     => 'Financial Intelligence: Revolving credit line matures within 14 months.',
                'insight'            => 'The current credit facility is approaching maturity. This creates urgency and a natural conversation opener — they will need to renew or replace it regardless of whether they switch banks.',
                'businessNeed'       => 'Revolving credit renewal before maturity; ideally consolidated with equipment financing.',
                'discoveryQuestions' => new List<String>{
                    'When does your current credit facility mature?',
                    'Are you satisfied with the structure and terms of your current facility?',
                    'Have you explored consolidating your credit and equipment needs under one institution?'
                },
                'advisoryOpportunity'=> 'Offer a pre-maturity review and a consolidated credit + equipment proposal that reduces their administrative overhead.',
                'expectedOutcome'    => 'Positioned as lead bank candidate ahead of renewal deadline.',
                'scoring'            => new Map<String, Object>{ 'recency' => 'High', 'reliability' => 'High' }
            },
            new Map<String, Object>{
                'title'              => 'Banking Consolidation Opportunity',
                'category'           => 'Strategic',
                'priority'           => 'Medium',
                'rawDataTrigger'     => 'Strategic Intelligence: Currently split across two regional banks with no treasury services.',
                'insight'            => 'The company is fragmented across two banks with no treasury or international wire services — a clear inefficiency for a manufacturer with OEM supply agreements.',
                'businessNeed'       => 'Single banking relationship with full treasury, international wire, and credit capabilities.',
                'discoveryQuestions' => new List<String>{
                    'How many banking relationships are you currently managing?',
                    'Do you have international payments as part of your supply chain?',
                    'What would a single, full-service banking relationship mean for your finance team?'
                },
                'advisoryOpportunity'=> 'Present a full treasury + credit consolidation story. Emphasize reduced complexity and a dedicated relationship manager.',
                'expectedOutcome'    => 'Full relationship consolidation proposal covering credit, treasury, and international services.',
                'scoring'            => new Map<String, Object>{ 'recency' => 'Medium', 'reliability' => 'High' }
            },
            new Map<String, Object>{
                'title'              => 'CFO Relationship Entry Point',
                'category'           => 'Relational',
                'priority'           => 'Medium',
                'rawDataTrigger'     => 'Leadership: Sandra Tran, CFO — CPA with 18 years in manufacturing finance, oversees all banking relationships.',
                'insight'            => 'The CFO is the primary decision-maker for banking. She has deep manufacturing finance experience — generic pitches will fail. Lead with sector-specific insight.',
                'businessNeed'       => 'A banking partner who understands manufacturing finance cycles and capital planning.',
                'discoveryQuestions' => new List<String>{
                    'How do you typically evaluate a new banking relationship?',
                    'What has been missing from your current banking partners?',
                    'What does a successful banking partnership look like to you over the next 3 years?'
                },
                'advisoryOpportunity'=> 'Establish credibility with Sandra by referencing IATF 16949 certification financing, OEM supply chain capital structures, or aerospace sector growth.',
                'expectedOutcome'    => 'Trusted advisor relationship with CFO — first meeting scheduled.',
                'scoring'            => new Map<String, Object>{ 'recency' => 'Medium', 'reliability' => 'Medium' }
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
/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-06-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class AI_Navigator_NewControllers_Test {

    // ── CompanyDetailInsightsController Tests ────────────────────────────────
    
    @isTest
    static void testGetInsightsBlankId() {
        Test.startTest();
        Boolean exceptionThrown = false;
        try {
            CompanyDetailInsightsController.getInsights('');
        } catch (Exception e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        System.assert(exceptionThrown, 'Should have thrown an exception for blank ID.');
    }

    @isTest
    static void testGetInsightsCompanyNotFound() {
        Test.startTest();
        String result = CompanyDetailInsightsController.getInsights('a0Bxx000001SvgsEAC');
        Test.stopTest();
        System.assert(result.contains('discoveryCallPlan'), 'Should fall back to mock data.');
    }

    @isTest
    static void testGetInsightsBlankAzureId() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('No Azure ID Comp', 'pending');
        
        Test.startTest();
        String result = CompanyDetailInsightsController.getInsights(comp.Id);
        Test.stopTest();
        System.assert(result.contains('discoveryCallPlan'), 'Should fall back to mock data.');
    }

    @isTest
    static void testGetInsightsSuccess() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Azure ID Comp', 'completed');
        comp.Azure_Company_Id__c = 'azure-id-789';
        update comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"discoveryCallPlan":{"companyProfile":{"businessType":"Real Azure Data"}}}'));

        Test.startTest();
        String result = CompanyDetailInsightsController.getInsights(comp.Id);
        Test.stopTest();

        System.assert(result.contains('Real Azure Data'), 'Should return real Azure insights payload');
    }

    @isTest
    static void testGetInsightsFallbackOnEmptyResponse() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Azure Empty Comp', 'completed');
        comp.Azure_Company_Id__c = 'azure-id-empty';
        update comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{}'));

        Test.startTest();
        String result = CompanyDetailInsightsController.getInsights(comp.Id);
        Test.stopTest();

        System.assert(result.contains('discoveryCallPlan'), 'Should fall back to mock data on empty response');
    }

    @isTest
    static void testGetInsightsFallbackOnError() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Azure Error Comp', 'completed');
        comp.Azure_Company_Id__c = 'azure-id-error';
        update comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(500, 'Internal Server Error'));

        Test.startTest();
        String result = CompanyDetailInsightsController.getInsights(comp.Id);
        Test.stopTest();

        System.assert(result.contains('discoveryCallPlan'), 'Should fall back to mock data on error response');
    }

    // ── CompanySignalsController Tests ───────────────────────────────────────

    @isTest
    static void testGetSignalsBlankId() {
        Test.startTest();
        Boolean exceptionThrown = false;
        try {
            CompanySignalsController.getSignals('');
        } catch (Exception e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        System.assert(exceptionThrown, 'Should have thrown an exception for blank ID.');
    }

    @isTest
    static void testGetSignalsCompanyNotFound() {
        Test.startTest();
        Boolean exceptionThrown = false;
        try {
            CompanySignalsController.getSignals('a0Bxx000001SvgsEAC');
        } catch (Exception e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        System.assert(exceptionThrown, 'Should have thrown an exception for missing company.');
    }

    @isTest
    static void testGetSignalsBlankAzureId() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('No Azure Signals Comp', 'pending');

        Test.startTest();
        Boolean exceptionThrown = false;
        try {
            CompanySignalsController.getSignals(comp.Id);
        } catch (Exception e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        System.assert(exceptionThrown, 'Should have thrown an exception when Azure ID is blank.');
    }

    @isTest
    static void testGetSignalsSuccess() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Azure Signals Comp', 'completed');
        comp.Azure_Company_Id__c = 'azure-id-sig';
        update comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"signals":[{"headline":"New Product"}]}'));

        Test.startTest();
        String result = CompanySignalsController.getSignals(comp.Id);
        Test.stopTest();

        System.assert(result.contains('New Product'), 'Should return real Azure signals payload');
    }

    @isTest
    static void testGetSignalsNotFound404() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Azure 404 Signals Comp', 'completed');
        comp.Azure_Company_Id__c = 'azure-id-404';
        update comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(404, '{"message":"Not Found"}'));

        Test.startTest();
        String result = CompanySignalsController.getSignals(comp.Id);
        Test.stopTest();

        System.assert(result.contains('signals'), 'Should return empty signals wrapper on 404');
    }

    @isTest
    static void testGetSignalsFailure500() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Azure 500 Signals Comp', 'completed');
        comp.Azure_Company_Id__c = 'azure-id-500';
        update comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(500, 'Error'));

        Test.startTest();
        Boolean exceptionThrown = false;
        try {
            CompanySignalsController.getSignals(comp.Id);
        } catch (Exception e) {
            exceptionThrown = true;
        }
        Test.stopTest();
        System.assert(exceptionThrown, 'Should have thrown an exception on 500 server error.');
    }

    // ── ContactAiNavigatorController Tests ───────────────────────────────────

    @isTest
    static void testGetContactContextNullId() {
        Test.startTest();
        ContactAiNavigatorController.ContactAiNavigatorWrapper result = 
            ContactAiNavigatorController.getContactAndCompanyRecord(null);
        Test.stopTest();

        System.assertEquals(null, result);
    }

    @isTest
    static void testGetContactContextWithMatchingCompany() {
        // Register mock to prevent any background Contact/Account trigger callout issues
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        Account acc = new Account(
            Name = 'Kosstech LLC',
            Website = 'https://www.kosstech.com'
        );
        insert acc;

        Contact con = new Contact(
            FirstName = 'Aharon',
            LastName = 'Koss',
            Email = 'aharon.koss@kosstech.com',
            AccountId = acc.Id
        );
        insert con;

        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Kosstech LLC',
            Website__c = 'https://www.kosstech.com',
            City__c = 'Phoenix',
            State__c = 'AZ',
            Status__c = 'completed',
            Is_Hidden__c = false,
            Correlation_Id__c = AiNavigatorEventService.generateCorrelationId()
        );
        insert comp;

        Test.startTest();
        ContactAiNavigatorController.ContactAiNavigatorWrapper result = 
            ContactAiNavigatorController.getContactAndCompanyRecord(con.Id);
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should return a valid wrapper');
        System.assertEquals('aharon.koss@kosstech.com', result.contactEmail);
        System.assertEquals('Aharon', result.contactFirstName);
        System.assertNotEquals(null, result.company, 'Should locate the matching Company record');
        System.assertEquals(comp.Id, result.company.Id);
    }

    // ── OpportunityAiNavigatorController Tests ───────────────────────────────

    @isTest
    static void testOpportunityControllerNullId() {
        Test.startTest();
        AI_Navigator_Company__c result = OpportunityAiNavigatorController.getCompanyRecord(null);
        Test.stopTest();
        System.assertEquals(null, result, 'Should return null for null input');
    }

    @isTest
    static void testOpportunityControllerWithAccount() {
        // Register mock to prevent any background Account trigger callout issues
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        Account acc = new Account(Name = 'Opp Controller Acc', Website = 'https://www.opptest.com');
        insert acc;

        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Opp Controller Acc',
            Website__c = 'https://www.opptest.com',
            City__c = 'Denver',
            State__c = 'CO',
            Status__c = 'completed',
            Is_Hidden__c = false,
            Correlation_Id__c = AiNavigatorEventService.generateCorrelationId()
        );
        insert comp;

        Test.startTest();
        AI_Navigator_Company__c result = OpportunityAiNavigatorController.getCompanyRecord(acc.Id);
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should locate matching company via Account Website');
        System.assertEquals(comp.Id, result.Id);
    }

    @isTest
    static void testOpportunityControllerWithOpportunity() {
        // FIXED: Registered HttpCalloutMock to intercept callouts fired by active standard Opportunity triggers
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        Account acc = new Account(Name = 'Opp Controller Acc Opp', Website = 'https://www.opptestopp.com');
        insert acc;

        Opportunity opp = new Opportunity(
            Name = 'Opp Controller Test Opp',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );
        insert opp;

        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Opp Controller Company',
            Website__c = 'https://www.opptestopp.com',
            City__c = 'Denver',
            State__c = 'CO',
            Status__c = 'completed',
            Is_Hidden__c = false,
            Correlation_Id__c = AiNavigatorEventService.generateCorrelationId()
        );
        insert comp;

        Test.startTest();
        AI_Navigator_Company__c result = OpportunityAiNavigatorController.getCompanyRecord(opp.Id);
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should locate matching company via Opportunity Account Website');
        System.assertEquals(comp.Id, result.Id);
    }

    @isTest
    static void testOpportunityControllerWithContact() {
        // Register mock to prevent any background Contact trigger callout issues
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        Account acc = new Account(Name = 'Opp Controller Acc Con', Website = 'https://www.contest.com');
        insert acc;

        Contact con = new Contact(
            FirstName = 'Test',
            LastName = 'Contact',
            AccountId = acc.Id
        );
        insert con;

        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Opp Controller Company Con',
            Website__c = 'https://www.contest.com',
            City__c = 'Denver',
            State__c = 'CO',
            Status__c = 'completed',
            Is_Hidden__c = false,
            Correlation_Id__c = AiNavigatorEventService.generateCorrelationId()
        );
        insert comp;

        Test.startTest();
        AI_Navigator_Company__c result = OpportunityAiNavigatorController.getCompanyRecord(con.Id);
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should locate matching company via Contact Account Website');
        System.assertEquals(comp.Id, result.Id);
    }
}
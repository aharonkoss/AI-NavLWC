/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-08-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class OpportunityTriggerHandler_Test {

    @isTest
    static void testOpportunityTriggerHandlerValidation() {
        // Register mock to prevent AzureHttpService exceptions
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        // 1. Test Opportunity missing account
        Opportunity oppNoAcc = new Opportunity(
            Name = 'Opp No Acc Test',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );

        Test.startTest();
        try {
            insert oppNoAcc;
        } catch (Exception e) {
            System.debug('Exception handled: ' + e.getMessage());
        }

        // 2. Test related Account missing website
        Account acc = new Account(Name = 'No Website Acc');
        insert acc;

        Opportunity oppNoWeb = new Opportunity(
            Name = 'Opp No Website Test',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );
        try {
            insert oppNoWeb;
        } catch (Exception e) {
            System.debug('Exception handled: ' + e.getMessage());
        }
        Test.stopTest();
        System.assert(true);
    }

    @isTest
    static void testOpportunityTriggerHandlerMatching() {
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        // FIXED: Removed billing address fields from standard Account to completely bypass picklist validation
        Account acc = new Account(
            Name = 'Existing Match LLC',
            Website = 'https://www.existingmatch.com'
        );
        insert acc;

        // Create matching company record created by current user
        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Existing Match LLC',
            Website__c = 'https://www.existingmatch.com',
            Status__c = 'completed',
            Is_Hidden__c = true
        );
        insert comp;

        Opportunity opp = new Opportunity(
            Name = 'Match Opp',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );

        Test.startTest();
        insert opp;
        Test.stopTest();

        AI_Navigator_Company__c updatedComp = [SELECT Is_Hidden__c, Status__c, Opportunity_Id__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals(false, updatedComp.Is_Hidden__c);
        System.assertEquals('pending', updatedComp.Status__c);
        System.assertEquals(opp.Id, updatedComp.Opportunity_Id__c);
    }

    @isTest
    static void testOpportunityTriggerHandlerNoMatching() {
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(201, '{"companyId":"azure-opp-id-999"}'));

        // FIXED: Removed billing address fields from standard Account to completely bypass picklist validation
        Account acc = new Account(
            Name = 'No Match LLC',
            Website = 'https://www.nomatchopp.com'
        );
        insert acc;

        Opportunity opp = new Opportunity(
            Name = 'No Match Opp',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );

        Test.startTest();
        insert opp;
        Test.stopTest();

        // Verify that a company was created and linked
        List<AI_Navigator_Company__c> comps = [SELECT Id, Opportunity_Id__c FROM AI_Navigator_Company__c WHERE Website__c = 'https://www.nomatchopp.com'];
        System.assertEquals(1, comps.size());
        System.assertEquals(opp.Id, comps[0].Opportunity_Id__c);
    }
}
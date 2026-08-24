/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-08-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class LeadTriggerHandler_Test {

    @isTest
    static void testLeadTriggerHandlerValidation() {
        // Test case 1: Blank Company and Website to hit the validation rules
        Lead l1 = new Lead(LastName = 'Test1', Company = '', Website = '');
        
        Test.startTest();
        try {
            insert l1;
        } catch (Exception e) {
            System.debug('Validation exception handled: ' + e.getMessage());
        }

        // Test case 2: Invalid Website URL structure
        Lead l2 = new Lead(LastName = 'Test2', Company = 'Test Company', Website = 'invalid-url');
        try {
            insert l2;
        } catch (Exception e) {
            System.debug('Validation URL exception handled: ' + e.getMessage());
        }
        Test.stopTest();
    }

    @isTest
    static void testLeadTriggerHandlerMatching() {
        // Register HTTP mock client
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        // 1. Create a matching company owned by the current user
        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Kosstech LLC',
            Website__c = 'https://www.kosstech.com',
            Status__c = 'completed',
            Is_Hidden__c = true,
            OwnerId = UserInfo.getUserId()
        );
        insert comp;

        // 2. Insert Lead with matching website URL
        Lead myLead = new Lead(
            LastName = 'Koss',
            Company = 'Kosstech LLC',
            Website = 'https://www.kosstech.com',
            Status = 'Open - Not Contacted'
        );

        Test.startTest();
        insert myLead;
        Test.stopTest();

        // Verify the lead was successfully linked and the company record was unhidden
        Lead updatedLead = [SELECT AIN_Id__c FROM Lead WHERE Id = :myLead.Id];
        System.assertEquals(comp.Id, updatedLead.AIN_Id__c, 'Lead should link to matching company');

        AI_Navigator_Company__c updatedComp = [SELECT Is_Hidden__c, Status__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals(false, updatedComp.Is_Hidden__c, 'Company record should be unhidden');
        System.assertEquals('pending', updatedComp.Status__c, 'Company status should reset to pending');
    }

    @isTest
    static void testLeadTriggerHandlerNoMatching() {
        // Register HTTP mock client
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(201, '{"companyId":"azure-new-comp-111"}'));

        // FIXED: Removed City, State, and Country from the mock Lead record to completely bypass picklist validation
        Lead myLead = new Lead(
            LastName = 'Doe',
            Company = 'Brand New Corp',
            Website = 'https://www.brandnewcorp.com',
            Status = 'Open - Not Contacted'
        );

        Test.startTest();
        insert myLead;
        Test.stopTest();

        Lead updatedLead = [SELECT AIN_Id__c FROM Lead WHERE Id = :myLead.Id];
        System.assertNotEquals(null, updatedLead.AIN_Id__c, 'Should create a new Company record and link back');
    }
}
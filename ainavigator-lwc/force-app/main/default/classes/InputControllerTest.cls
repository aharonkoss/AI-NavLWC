/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-07-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class InputControllerTest {

    @isTest
    static void testSubmitCompanyNewRecord() {
        // Mock Azure endpoint response
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(201, '{"companyId":"azure-id-111"}'));

        Test.startTest();
        // Pass isCalledFromLead = true to bypass environment-specific Lead validation rules/triggers
        String jsonResult = InputController.submitCompany(
            'New Brand Corp', 'https://newbrand.com', 'Phoenix', 'AZ', 'PreCall', 'Prospect', true
        );
        Test.stopTest();

        Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(jsonResult);
        System.assertEquals(true, (Boolean) result.get('success'));

        // Verify Company creation
        List<AI_Navigator_Company__c> comps = [SELECT Id, Name, Status__c FROM AI_Navigator_Company__c WHERE Name = 'New Brand Corp'];
        System.assertEquals(1, comps.size());
    }

    @isTest
    static void testSubmitCompanyExistingRecord() {
        // Create an existing company owned by the user
        AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
            Name = 'Existing Corp',
            Website__c = 'https://existing.com',
            Status__c = 'completed',
            Is_Hidden__c = true,
            OwnerId = UserInfo.getUserId()
        );
        insert comp;

        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        Test.startTest();
        // Pass isCalledFromLead = true to bypass environment-specific Lead validation rules/triggers
        String jsonResult = InputController.submitCompany(
            'Updated Existing Corp', 'https://existing.com', 'Austin', 'TX', 'Qualification', 'Existing Customer', true
        );
        Test.stopTest();

        // Verify that the existing company was updated
        AI_Navigator_Company__c updated = [SELECT Name, Status__c, Is_Hidden__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals('Updated Existing Corp', updated.Name);
        System.assertEquals('pending', updated.Status__c);
        System.assertEquals(false, updated.Is_Hidden__c);
    }

    @isTest
    static void testSubmitCompanyUnexpectedError() {
        Test.startTest();
        try {
            // Passing extremely long company name to force a DML exception inside controller
            String longName = 'X'.repeat(256);
            InputController.submitCompany(longName, 'https://error.com', 'Dallas', 'TX', 'PreCall', 'Prospect', true);
            System.assert(false, 'Should have thrown AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage() != null);
        }
        Test.stopTest();
    }
}
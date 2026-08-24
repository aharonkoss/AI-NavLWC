/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-09-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class AI_Navigator_Inbound_TriggerTest {

    @isTest
    static void testPlatformEventTriggerAndHandler() {
        // 1. Prepare exactly one test event with only the essential fields.
        // We leave Status_Code__c and Payload__c null to avoid picklist
        // or field limit constraints on the AI_Navigator_Request_Log__c object.
        List<AI_Navigator_Inbound__e> testEvents = new List<AI_Navigator_Inbound__e>();
        
        testEvents.add(new AI_Navigator_Inbound__e(
            Event_Type__c = 'UNKNOWN_TEST_TYPE',
            Message_Id__c = 'msg-test-123',
            Correlation_Id__c = 'corr-test-123'
        ));

        // 2. Start the test context
        Test.startTest();
        
        // 3. Publish the platform event
        List<Database.SaveResult> publishResults = EventBus.publish(testEvents);
        
        // 4. Force delivery
        Test.getEventBus().deliver();
        
        Test.stopTest();

        // 5. Verify the event was successfully published
        System.assert(publishResults[0].isSuccess(), 'The platform event should have published successfully.');

        // 6. Query the logs created during this test execution
        List<AI_Navigator_Request_Log__c> logs = [
            SELECT Id, Correlation_ID__c, HTTP_Method__c 
            FROM AI_Navigator_Request_Log__c
        ];
        
        // 7. Assertions
        System.assertEquals(1, logs.size(), 'A log record should be created for the processed event.');
        System.assertEquals('PLATFORM_EVENT', logs[0].HTTP_Method__c, 'HTTP method should match PLATFORM_EVENT.');
        System.assertEquals('corr-test-123', logs[0].Correlation_ID__c, 'The correlation ID should match.');
    }
}
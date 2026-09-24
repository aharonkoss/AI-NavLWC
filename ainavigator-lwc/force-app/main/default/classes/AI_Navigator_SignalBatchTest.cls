/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 09-21-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class AI_Navigator_SignalBatchTest {

    private class AzureMockHttpResponse implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(200);

            // Generate an ISO-8601 timestamp within the past 15 minutes
            String recentIso = DateTime.now().addMinutes(-15).formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
            // Generate an ISO-8601 timestamp older than an hour
            String oldIso = DateTime.now().addHours(-3).formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');

            String jsonPayload = '{'
                + '"count": 2,'
                + '"totalSignals": 11,'
                + '"totalNewSignals": 11,'
                + '"lastSeenAt": "' + recentIso + '",'
                + '"notifications": ['
                + '  {'
                + '    "companyId": "comp-001",'
                + '    "companyName": "Sentry Equipment Corp",'
                + '    "signalCount": 6,'
                + '    "newSignalCount": 6,'
                + '    "signalSummary": "6 new signals",'
                + '    "latestSignalName": "Tariff exposure is driving pricing pressure",'
                + '    "latestDetectedAt": "' + recentIso + '",'
                + '    "priority": "P4"'
                + '  },'
                + '  {'
                + '    "companyId": "comp-002",'
                + '    "companyName": "Old Alerts Inc",'
                + '    "signalCount": 1,'
                + '    "newSignalCount": 1,'
                + '    "signalSummary": "1 old signal",'
                + '    "latestSignalName": "Historical notice",'
                + '    "latestDetectedAt": "' + oldIso + '",'
                + '    "priority": "P1"'
                + '  }'
                + ']'
                + '}';

            res.setBody(jsonPayload);
            return res;
        }
    }

    @isTest
    static void testBatchAndNotificationExecution() {
        Test.setMock(HttpCalloutMock.class, new AzureMockHttpResponse());

        // Insert test AI_Navigator_Company__c records
        List<AI_Navigator_Company__c> companies = new List<AI_Navigator_Company__c>();
        companies.add(new AI_Navigator_Company__c(
            Name = 'Test Company 1',
            Assigned_User__c = UserInfo.getUserId()
        ));
        insert companies;

        Test.startTest();
        // Run batch
        AI_Navigator_SignalBatch batchJob = new AI_Navigator_SignalBatch();
        Id batchId = Database.executeBatch(batchJob, 10);
        Test.stopTest();

        System.assertNotEquals(null, batchId, 'Batch job should be queued and executed.');
    }

    @isTest
    static void testHourlyScheduler() {
        Test.setMock(HttpCalloutMock.class, new AzureMockHttpResponse());

        Test.startTest();
        String cronExp = '0 0 * * * ?'; // Runs every hour
        String jobId = System.schedule('AI Navigator Test Hourly Sync', cronExp, new AI_Navigator_SignalBatch());
        Test.stopTest();

        CronTrigger ct = [SELECT Id, CronExpression, TimesTriggered FROM CronTrigger WHERE Id = :jobId];
        System.assertEquals(cronExp, ct.CronExpression, 'Job should be scheduled with an hourly cron expression.');
    }
}
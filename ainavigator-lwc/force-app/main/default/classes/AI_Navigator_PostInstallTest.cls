/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 09-21-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class AI_Navigator_PostInstallTest {

    @isTest
    static void testInstallScript() {
        AI_Navigator_PostInstall postInstall = new AI_Navigator_PostInstall();

        Test.startTest();
        // Simulates a fresh install (previous version = null)
        Test.testInstall(postInstall, null);
        Test.stopTest();

        List<CronTrigger> jobs = [
            SELECT Id, CronJobDetail.Name, CronExpression 
            FROM CronTrigger 
            WHERE CronJobDetail.Name = 'AI Navigator Hourly Signal Notification Sync'
        ];

        System.assertEquals(1, jobs.size(), 'Hourly job should be scheduled by the install script.');
        System.assertEquals('0 0 * * * ?', jobs[0].CronExpression);
    }
}
/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 09-21-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public without sharing class AI_Navigator_PostInstall implements InstallHandler {

    public void onInstall(InstallContext context) {
        String jobName = 'AI Navigator Hourly Signal Notification Sync';

        // Check if the scheduled job is already registered
        List<CronTrigger> existingJobs = [
            SELECT Id, CronJobDetail.Name 
            FROM CronTrigger 
            WHERE CronJobDetail.Name = :jobName 
            LIMIT 1
        ];

        // Schedule only if not already present
        if (existingJobs.isEmpty()) {
            System.schedule(
                jobName,
                '0 0 * * * ?', // Top of every hour
                new AI_Navigator_SignalBatch()
            );
        }
    }
}
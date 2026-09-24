/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 09-22-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class AI_Navigator_SignalBatch implements Database.Batchable<Id>, Database.AllowsCallouts, Schedulable {

    private Boolean processAllSignals = false;

    // Parameterized constructor (pass true to push ALL signals)
    public AI_Navigator_SignalBatch(Boolean processAllSignals) {
        this.processAllSignals = processAllSignals;
    }

    /**
     * Schedulable execution: Always runs in hourly mode (false)
     */
    public void execute(SchedulableContext sc) {
        Database.executeBatch(new AI_Navigator_SignalBatch(false), 20);
    }

    public Iterable<Id> start(Database.BatchableContext bc) {
        Set<Id> userIds = new Set<Id>();
        for (AggregateResult ar : [
            SELECT Assigned_User__c assignedUser 
            FROM AI_Navigator_Company__c 
            WHERE Assigned_User__c != null 
            GROUP BY Assigned_User__c
        ]) {
            Id uId = (Id) ar.get('assignedUser');
            if (uId != null) {
                userIds.add(uId);
            }
        }
        return new List<Id>(userIds);
    }

    public void execute(Database.BatchableContext bc, List<Id> userIds) {
        for (Id userId : userIds) {
            try {
                AI_Navigator_HeaderController.processNotificationSignals(String.valueOf(userId), this.processAllSignals);
            } catch (Exception ex) {
                System.debug(LoggingLevel.ERROR, 'Error syncing signals for User ' + userId + ': ' + ex.getMessage());
            }
        }
    }

    public void finish(Database.BatchableContext bc) {
        System.debug(LoggingLevel.INFO, 'AI_Navigator_SignalBatch finished. processAllSignals = ' + this.processAllSignals);
    }
}
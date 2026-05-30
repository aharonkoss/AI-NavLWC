/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 05-28-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
trigger LeadTrigger on Lead (before insert) {
    if (Trigger.isBefore && Trigger.isInsert) {
        LeadTriggerHandler.handleBeforeInsert(Trigger.new);
    }
}
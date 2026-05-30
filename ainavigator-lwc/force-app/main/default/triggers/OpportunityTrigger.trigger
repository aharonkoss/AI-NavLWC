/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 05-29-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
trigger OpportunityTrigger on Opportunity (after insert) {
    if (Trigger.isAfter && Trigger.isInsert) {
        OpportunityTriggerHandler.handleAfterInsert(Trigger.new);
    }
}
/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 05-29-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class OpportunityAiNavigatorController {
    
    @AuraEnabled(cacheable=false)
    public static Company__c getCompanyRecord(Id opportunityId) {
        try {
            if (opportunityId == null) {
                return null;
            }
            List<Company__c> companies = [
                SELECT Id, Name, Status__c, Website__c, City__c, State__c 
                FROM Company__c 
                WHERE Opportunity_Id__c = :opportunityId 
                ORDER BY CreatedDate DESC 
                LIMIT 1
            ];
            return companies.isEmpty() ? null : companies[0];
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving Company details: ' + e.getMessage());
        }
    }
}
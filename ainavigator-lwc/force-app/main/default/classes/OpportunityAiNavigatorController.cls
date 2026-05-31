/**
 * @description Controller for the Opportunity-linked AI Navigator LWC.
 *              Retrieves the Company__c record associated with the Opportunity's Account Website.
 * @author       AI Navigator Platform
 * @last modified on : 05-30-2026
 */
public with sharing class OpportunityAiNavigatorController {
    
    @AuraEnabled(cacheable=false)
    public static Company__c getCompanyRecord(Id opportunityId) {
        try {
            if (opportunityId == null) {
                return null;
            }
            
            // 1. Get the Opportunity's related Account Website
            List<Opportunity> opps = [
                SELECT AccountId, Account.Website 
                FROM Opportunity 
                WHERE Id = :opportunityId 
                LIMIT 1
            ];
            
            if (opps.isEmpty() || opps[0].AccountId == null || String.isBlank(opps[0].Account.Website)) {
                return null;
            }
            
            String accountWebsite = opps[0].Account.Website;
            
            // 2. Query the Company__c record matching the Account's website
            List<Company__c> companies = [
                SELECT Id, Name, Status__c, Website__c, City__c, State__c, Azure_Company_Id__c 
                FROM Company__c 
                WHERE Website__c = :accountWebsite 
                ORDER BY CreatedDate DESC 
                LIMIT 1
            ];
            
            return companies.isEmpty() ? null : companies[0];
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving Company details: ' + e.getMessage());
        }
    }
}
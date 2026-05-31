/**
 * @description Handler for Opportunity triggers. Manages duplicate checks and 
 *              syncs newly inserted Opportunities to AI Navigator Company records.
 * @author       AI Navigator Platform
 * @last modified on : 05-30-2026
 */
public with sharing class OpportunityTriggerHandler {
    
    public static void handleAfterInsert(List<Opportunity> newOpps) {
        // 1. Retrieve the Custom Notification Type
        Id notificationTypeId = null;
        try {
            CustomNotificationType notificationType = [
                SELECT Id FROM CustomNotificationType 
                WHERE DeveloperName = 'AI_Navigator_Notification' 
                LIMIT 1
            ];
            notificationTypeId = notificationType.Id;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'AI_Navigator_Notification CustomNotificationType not found: ' + e.getMessage());
        }

        // 2. Gather Account IDs to fetch details in bulk
        Set<Id> accountIds = new Set<Id>();
        for (Opportunity opp : newOpps) {
            if (opp.AccountId != null) {
                accountIds.add(opp.AccountId);
            }
        }

        // Query the Accounts with Billing addresses
        Map<Id, Account> accountMap = new Map<Id, Account>([
            SELECT Id, Name, Website, BillingCity, BillingState 
            FROM Account 
            WHERE Id IN :accountIds
        ]);

        // Gather all websites to check for existing Company__c records
        Set<String> accountWebsites = new Set<String>();
        for (Account acc : accountMap.values()) {
            if (String.isNotBlank(acc.Website)) {
                accountWebsites.add(acc.Website);
            }
        }

        // Query existing Company__c records matching these websites
        Map<String, Company__c> existingCompaniesMap = new Map<String, Company__c>();
        if (!accountWebsites.isEmpty()) {
            List<Company__c> existingCompanies = [
                SELECT Id, Website__c, Opportunity_Id__c, Account_Id__c 
                FROM Company__c 
                WHERE Website__c IN :accountWebsites
            ];
            for (Company__c comp : existingCompanies) {
                existingCompaniesMap.put(comp.Website__c, comp);
            }
        }

        List<Company__c> companiesToUpdate = new List<Company__c>();

        for (Opportunity opp : newOpps) {
            // Check if the Opportunity has a related Account
            if (opp.AccountId == null) {
                if (notificationTypeId != null) {
                    sendBellNotification(notificationTypeId, 'Missing Account', 'Opportunity is missing a related Account record.', UserInfo.getUserId());
                }
                opp.addError('An Account is required for AI Navigator tracking on Opportunities.');
                continue;
            }

            Account acc = accountMap.get(opp.AccountId);
            if (acc == null) {
                opp.addError('Unable to retrieve the related Account details.');
                continue;
            }

            // Check if Account has Name and Website
            if (String.isBlank(acc.Name) || String.isBlank(acc.Website)) {
                if (notificationTypeId != null) {
                    sendBellNotification(notificationTypeId, 'Missing Information', 'Related Account requires a Name and Website.', UserInfo.getUserId());
                }
                opp.addError('Account Name and Website are required for AI Navigator.');
                continue;
            }

            // URL Format Validation
            String urlRegex = '^https?://[a-zA-Z0-9\\-\\.]+\\.[a-zA-Z]{2,}.*$';
            Pattern urlPattern = Pattern.compile(urlRegex);
            if (!urlPattern.matcher(acc.Website).matches()) {
                if (notificationTypeId != null) {
                    sendBellNotification(notificationTypeId, 'Invalid URL', 'Account Website format must begin with http:// or https://', UserInfo.getUserId());
                }
                opp.addError('Valid Account Website URL starting with http:// or https:// is required.');
                continue;
            }

            // Address Fallback Check
            String city = String.isNotBlank(acc.BillingCity) ? acc.BillingCity : 'Scottsdale';
            String state = String.isNotBlank(acc.BillingState) ? acc.BillingState : 'AZ';

            // Duplicate Check logic: Link if exists, submit if new
            if (existingCompaniesMap.containsKey(acc.Website)) {
                Company__c existingComp = existingCompaniesMap.get(acc.Website);
                
                // Relink lookup fields to the newest Opportunity and Account context
                existingComp.Opportunity_Id__c = opp.Id;
                existingComp.Account_Id__c = opp.AccountId;
                companiesToUpdate.add(existingComp);

                if (notificationTypeId != null) {
                    sendBellNotification(notificationTypeId, 'Existing Match Linked', 'Opportunity linked to existing Company research record.', UserInfo.getUserId());
                }
            } else {
                // Submit to AI Navigator (Async Azure Callout queue)
                try {
                    String jsonResponse = InputController.submitCompany(
                        acc.Name,
                        acc.Website,
                        city,
                        state,
                        'PreCall',
                        'Opportunity',
                        true // isCalledFromLead = true (prevents duplicate Lead creation)
                    );

                    Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(jsonResponse);
                    if (responseMap.containsKey('companyId')) {
                        String compId = (String) responseMap.get('companyId');
                        
                        companiesToUpdate.add(new Company__c(
                            Id = compId,
                            Opportunity_Id__c = opp.Id,
                            Account_Id__c = opp.AccountId
                        ));

                        if (notificationTypeId != null) {
                            sendBellNotification(notificationTypeId, 'AI Navigator Success', 'Opportunity/Company sync initiated.', UserInfo.getUserId());
                        }
                    }
                } catch (Exception e) {
                    opp.addError('AI Navigator Integration Error: ' + e.getMessage());
                }
            }
        }

        // Perform standard DML update on Companies list
        if (!companiesToUpdate.isEmpty()) {
            try {
                update companiesToUpdate;
            } catch (Exception e) {
                System.debug(LoggingLevel.ERROR, 'Failed to update Company relationship lookups: ' + e.getMessage());
            }
        }
    }

    private static void sendBellNotification(Id typeId, String title, String body, Id targetId) {
        Messaging.CustomNotification notification = new Messaging.CustomNotification();
        notification.setNotificationTypeId(typeId);
        notification.setTitle(title);
        notification.setBody(body);
        notification.setTargetId(targetId);
        try {
            notification.send(new Set<String>{UserInfo.getUserId()});
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Custom notification delivery failed: ' + e.getMessage());
        }
    }
}
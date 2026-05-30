/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 05-29-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
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

        List<Company__c> companiesToUpdate = new List<Company__c>();

        for (Opportunity opp : newOpps) {
            // 3. Validation: Check if the Opportunity has a related Account
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

            // 4. Validation: Check if Account has Name and Website
            if (String.isBlank(acc.Name) || String.isBlank(acc.Website)) {
                if (notificationTypeId != null) {
                    sendBellNotification(notificationTypeId, 'Missing Information', 'Related Account requires a Name and Website.', UserInfo.getUserId());
                }
                opp.addError('Account Name and Website are required for AI Navigator.');
                continue;
            }

            // 5. URL Format Validation
            String urlRegex = '^https?://[a-zA-Z0-9\\-\\.]+\\.[a-zA-Z]{2,}.*$';
            Pattern urlPattern = Pattern.compile(urlRegex);
            if (!urlPattern.matcher(acc.Website).matches()) {
                if (notificationTypeId != null) {
                    sendBellNotification(notificationTypeId, 'Invalid URL', 'Account Website format must begin with http:// or https://', UserInfo.getUserId());
                }
                opp.addError('Valid Account Website URL starting with http:// or https:// is required.');
                continue;
            }

            // 6. Address Fallback Check
            String city = String.isNotBlank(acc.BillingCity) ? acc.BillingCity : 'Scottsdale';
            String state = String.isNotBlank(acc.BillingState) ? acc.BillingState : 'AZ';

            try {
                // Call input controller. We pass true to skip Lead creation inside submitCompany.
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
                    
                    // Add Company record to update list with the new lookup linkages
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

        // 7. Perform DML update to relate Lookup IDs on the newly created Company__c records
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
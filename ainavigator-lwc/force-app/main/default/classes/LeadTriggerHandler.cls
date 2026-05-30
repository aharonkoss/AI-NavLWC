/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 05-29-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class LeadTriggerHandler {
    
    public static void handleBeforeInsert(List<Lead> newLeads) {
        CustomNotificationType notificationType = [
            SELECT Id FROM CustomNotificationType 
            WHERE DeveloperName = 'AI_Navigator_Notification' 
            LIMIT 1
        ];

        for (Lead myLead : newLeads) {
            // 1. Validation
            if (String.isBlank(myLead.Company) || String.isBlank(myLead.Website)) {
                sendBellNotification(notificationType.Id, 'Missing Information', 'Lead requires Company Name and Website.', UserInfo.getUserId());
                myLead.addError('Company Name and Website are required for AI Navigator.');
                continue;
            }

            // 2. URL Validation
            String urlRegex = '^https?://[a-zA-Z0-9\\-\\.]+\\.[a-zA-Z]{2,}.*$';
            Pattern urlPattern = Pattern.compile(urlRegex);
            if (!urlPattern.matcher(myLead.Website).matches()) {
                sendBellNotification(notificationType.Id, 'Invalid URL', 'Format must be https://example.com', UserInfo.getUserId());
                myLead.addError('Valid Website URL starting with http:// or https:// is required.');
                continue;
            }

            // 3. Duplicate Check
            List<Company__c> existingCompanies = [
                SELECT Id FROM Company__c 
                WHERE Website__c = :myLead.Website 
                LIMIT 1
            ];

            if (!existingCompanies.isEmpty()) {
                myLead.AIN_Id__c = existingCompanies[0].Id;
                sendBellNotification(notificationType.Id, 'Match Found', 'Lead linked to existing Company.', UserInfo.getUserId());
            } else {
                try {
                    String city = String.isNotBlank(myLead.City) ? myLead.City : 'Scottsdale';
                    String state = String.isNotBlank(myLead.State) ? myLead.State : 'AZ';
                    
                    // Call Controller - Passing TRUE to skip duplicate Lead creation
                    String jsonResponse = InputController.submitCompany(
                        myLead.Company,
                        myLead.Website,
                        city,
                        state,
                        'PreCall',
                        'Lead',
                        true // isCalledFromLead = true
                    );

                    Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(jsonResponse);
                    if (responseMap.containsKey('companyId')) {
                        myLead.AIN_Id__c = (String) responseMap.get('companyId');
                        sendBellNotification(notificationType.Id, 'AI Navigator Success', 'Lead/Company sync initiated.', UserInfo.getUserId());
                    }
                } catch (Exception e) {
                    myLead.addError('AI Navigator Integration Error: ' + e.getMessage());
                }
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
            System.debug('Notification failed: ' + e.getMessage());
        }
    }
}
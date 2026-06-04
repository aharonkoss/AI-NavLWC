/**
 * @description Updated Handler for LeadTrigger. 
 *              When a Lead is inserted, it checks for a matching Company__c by Website.
 *              If found: Unhides the company, sets status to pending, and links it.
 *              If not found: Calls InputController to create a new Company and Azure request.
 */
public with sharing class LeadTriggerHandler {
    
    public static void handleBeforeInsert(List<Lead> newLeads) {
        CustomNotificationType notificationType = [
            SELECT Id FROM CustomNotificationType 
            WHERE DeveloperName = 'AI_Navigator_Notification' 
            LIMIT 1
        ];

        // List to hold Companies that need to be "unhidden"
        List<Company__c> companiesToUpdate = new List<Company__c>();

        for (Lead myLead : newLeads) {
            // 1. Validation: Company and Website Presence
            if (String.isBlank(myLead.Company) || String.isBlank(myLead.Website)) {
                sendBellNotification(notificationType.Id, 'Missing Information', 'Lead requires Company Name and Website.', UserInfo.getUserId());
                myLead.addError('Company Name and Website are required for AI Navigator.');
                continue;
            }

            // 2. Validation: URL Format (e.g., https://google.com)
            String urlRegex = '^https?://[a-zA-Z0-9\\-\\.]+\\.[a-zA-Z]{2,}.*$';
            Pattern urlPattern = Pattern.compile(urlRegex);
            Matcher urlMatcher = urlPattern.matcher(myLead.Website);
            
            if (!urlMatcher.matches()) {
                sendBellNotification(notificationType.Id, 'Invalid URL', 'The Website format is incorrect. Use https://example.com', UserInfo.getUserId());
                myLead.addError('The Website must be a valid URL starting with http:// or https://');
                continue;
            }

            // 3. Duplicate Check: Look for existing Company__c by Website
            List<Company__c> existingCompanies = [
                SELECT Id, Is_Hidden__c, Status__c 
                FROM Company__c 
                WHERE Website__c = :myLead.Website 
                LIMIT 1
            ];

            if (!existingCompanies.isEmpty()) {
                Company__c matchedComp = existingCompanies[0];
                
                // Link the Lead to the existing Company ID
                myLead.AIN_Id__c = matchedComp.Id;

                // NEW LOGIC: Unhide the record and set status to pending
                matchedComp.Is_Hidden__c = false;
                matchedComp.Status__c    = 'pending';
                companiesToUpdate.add(matchedComp);

                sendBellNotification(notificationType.Id, 'Match Found', 'Lead linked to existing Company record and unhidden.', UserInfo.getUserId());
            } else {
                // No match: Process new submission via InputController
                try {
                    // Set default logic for AI Navigator
                    String city = String.isNotBlank(myLead.City) ? myLead.City : 'Scottsdale';
                    String state = String.isNotBlank(myLead.State) ? myLead.State : 'AZ';
                    
                    // Call InputController - passing 'true' to skip duplicate Lead creation within the controller
                    String jsonResponse = InputController.submitCompany(
                        myLead.Company,
                        myLead.Website,
                        city,
                        state,
                        'PreCall', 
                        'Lead',
                        true 
                    );

                    // Parse the response from InputController
                    Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(jsonResponse);
                    if (responseMap.containsKey('companyId')) {
                        myLead.AIN_Id__c = (String) responseMap.get('companyId');
                        sendBellNotification(notificationType.Id, 'AI Navigator Success', 'Lead sent to Azure AI Navigator successfully.', UserInfo.getUserId());
                    }
                } catch (Exception e) {
                    myLead.addError('AI Navigator Integration Error: ' + e.getMessage());
                }
            }
        }

        // Perform bulk update on Companies that were matched
        if (!companiesToUpdate.isEmpty()) {
            try {
                update companiesToUpdate;
            } catch (DmlException de) {
                System.debug('LeadTriggerHandler: Failed to update matching companies: ' + de.getMessage());
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
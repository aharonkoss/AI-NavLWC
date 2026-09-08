/**
 * @description       : Handles company submission and Lead creation with State Picklist support
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @last modified on  : 09-07-2026
**/
public with sharing class InputController {

    @AuraEnabled
    public static String submitCompany(
        String companyName,
        String website,
        String city,
        String state,
        String stage,
        String clientType,
        Boolean isCalledFromLead 
    ) {
        String correlationId = '';
        try {
            Id currentUserId = UserInfo.getUserId();

            // 1. Check if a company with the same Website already exists OWNED by the current user
            List<AI_Navigator_Company__c> existingCompanies = [
                SELECT Id, Name, Website__c, City__c, State__c, Stage_List__c, Client_Type_List__c, 
                       Status__c, Correlation_Id__c, CreatedDate, Is_Hidden__c
                FROM AI_Navigator_Company__c
                WHERE OwnerId = :currentUserId AND Website__c = :website
                LIMIT 1
            ];

            if (!existingCompanies.isEmpty()) {
                AI_Navigator_Company__c existingCompany = existingCompanies[0];
                correlationId = existingCompany.Correlation_Id__c;
                
                // Unhide and refresh properties
                existingCompany.Is_Hidden__c = false;
                existingCompany.Name = companyName;
                existingCompany.City__c = city;
                existingCompany.State__c = state;
                existingCompany.Stage_List__c = stage;
                existingCompany.Client_Type_List__c = clientType;
                existingCompany.Status__c = 'pending';
                
                update existingCompany;

                // Check if a Lead exists for this Company. If not, create one.
                if (isCalledFromLead == null || !isCalledFromLead) {
                    List<Lead> existingLeads = [
                        SELECT Id FROM Lead 
                        WHERE AIN_Id__c = :existingCompany.Id 
                        AND IsConverted = false 
                        LIMIT 1
                    ];

                    if (existingLeads.isEmpty()) {
                        Lead newLead = new Lead(
                            LastName  = companyName,
                            Company   = companyName,
                            Website   = website,
                            City      = city,
                            Status    = 'Open - Not Contacted',
                            AIN_Id__c = existingCompany.Id
                        );
                        populateLeadAddress(newLead, state);
                        insert newLead;
                    }
                }

                return JSON.serialize(new Map<String, Object>{
                    'success'       => true,
                    'companyId'     => existingCompany.Id,
                    'correlationId' => existingCompany.Correlation_Id__c,
                    'name'          => existingCompany.Name,
                    'website'       => existingCompany.Website__c,
                    'city'          => existingCompany.City__c,
                    'state'         => existingCompany.State__c,
                    'stage'         => existingCompany.Stage_List__c,
                    'clientType'    => existingCompany.Client_Type_List__c,
                    'status'        => 'pending',
                    'createdAt'     => String.valueOf(existingCompany.CreatedDate)
                });
            }

            // 2. Standard creation process (No existing record found)
            correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();

            AI_Navigator_Company__c company = new AI_Navigator_Company__c(
                Name                 = companyName,
                Website__c           = website,
                City__c              = city,
                State__c             = state,
                Stage_List__c        = stage,
                Client_Type_List__c  = clientType,
                Status__c            = 'pending',
                Correlation_Id__c    = correlationId,
                Is_Hidden__c         = false,
                OwnerId              = currentUserId
            );
            insert company;

            if (isCalledFromLead == null || !isCalledFromLead) {
                Lead newLead = new Lead(
                    LastName  = companyName,
                    Company   = companyName,
                    Website   = website,
                    City      = city,
                    Status    = 'Open - Not Contacted',
                    AIN_Id__c = company.Id
                );
                populateLeadAddress(newLead, state);
                insert newLead;
            }

            System.enqueueJob(new AzureManualCompanyCallout(
                company.Id, companyName, website, city, state, stage, clientType, company.Id 
            ));

            return JSON.serialize(new Map<String, Object>{
                'success'       => true,
                'companyId'     => company.Id,
                'correlationId' => correlationId,
                'name'          => companyName,
                'status'        => 'pending'
            });

        } catch (Exception e) {
            logError('InputController.submitCompany', 'POST', correlationId, e.getMessage() + ' | ' + e.getStackTraceString());
            throw createHandledException(e.getMessage());
        }
    }

    // ── Helper: Safe State & Country mapping ─────────────────────────────────
    private static void populateLeadAddress(Lead leadRecord, String stateInput) {
        if (String.isBlank(stateInput)) {
            leadRecord.Country = 'United States';
            return;
        }

        String cleanState = stateInput.trim();
        
        if (cleanState.length() == 2) {
            // ISO 2-letter Code (e.g., 'AZ', 'CA', 'NY')
            leadRecord.CountryCode = 'US';
            leadRecord.StateCode   = cleanState.toUpperCase();
        } else {
            // Full Name (e.g., 'Arizona', 'California')
            leadRecord.Country = 'United States';
            leadRecord.State   = cleanState;
        }
    }

    // ── Private: Log only when an error occurs ──────────────────────────────
    private static void logError(String endpointName, String httpMethod, String correlationId, String errorMessage) {
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = httpMethod,
                Endpoint_Name__c    = endpointName,
                Status__c           = 'Failed',
                Correlation_ID__c   = correlationId,
                Error_Message__c    = errorMessage != null ? errorMessage.left(32768) : null
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
        }
    }

    private static AuraHandledException createHandledException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
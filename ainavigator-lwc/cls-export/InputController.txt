/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 06-26-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
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
        try {
            Id currentUserId = UserInfo.getUserId();

            // 1. Check if a company with the same Website already exists OWNED by the current user
            // Changed filter from CreatedById to OwnerId for better accuracy
            List<AI_Navigator_Company__c> existingCompanies = [
                SELECT Id, Name, Website__c, City__c, State__c, Stage__c, Client_Type__c, Status__c, Correlation_Id__c, CreatedDate, Is_Hidden__c
                FROM AI_Navigator_Company__c
                WHERE OwnerId = :currentUserId AND Website__c = :website
                LIMIT 1
            ];

            if (!existingCompanies.isEmpty()) {
                AI_Navigator_Company__c existingCompany = existingCompanies[0];
                
                // Unhide and refresh properties
                existingCompany.Is_Hidden__c = false;
                existingCompany.Name = companyName;
                existingCompany.City__c = city;
                existingCompany.State__c = state;
                existingCompany.Stage__c = stage;
                existingCompany.Client_Type__c = clientType;
                existingCompany.Status__c = 'pending';
                
                update existingCompany;

                // FIX: Check if a Lead exists for this Company. If not, create one.
                // (Only if this wasn't triggered by a Lead creation already)
                if (isCalledFromLead == null || !isCalledFromLead) {
                    List<Lead> existingLeads = [
                        SELECT Id FROM Lead 
                        WHERE AIN_Id__c = :existingCompany.Id 
                        AND IsConverted = false 
                        LIMIT 1
                    ];

                    if (existingLeads.isEmpty()) {
                        insert new Lead(
                            LastName  = companyName,
                            Company   = companyName,
                            Website   = website,
                            City      = city,
                            State     = state,
                            Country   = 'United States',
                            Status    = 'Open - Not Contacted',
                            AIN_Id__c = existingCompany.Id
                        );
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
                    'stage'         => existingCompany.Stage__c,
                    'clientType'    => existingCompany.Client_Type__c,
                    'status'        => 'pending',
                    'createdAt'     => String.valueOf(existingCompany.CreatedDate)
                });
            }

            // 2. Standard creation process (No existing record found)
            String correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();

            AI_Navigator_Company__c company = new AI_Navigator_Company__c(
                Name             = companyName,
                Website__c       = website,
                City__c          = city,
                State__c         = state,
                Stage__c         = stage,
                Client_Type__c   = clientType,
                Status__c        = 'pending',
                Correlation_Id__c = correlationId,
                Is_Hidden__c     = false,
                OwnerId          = currentUserId
            );
            insert company;

            if (isCalledFromLead == null || !isCalledFromLead) {
                insert new Lead(
                    LastName  = companyName,
                    Company   = companyName,
                    Website   = website,
                    City      = city,
                    State     = state,
                    Country   = 'United States',
                    Status    = 'Open - Not Contacted',
                    AIN_Id__c = company.Id
                );
            }

            System.enqueueJob(new AzureManualCompanyCallout(
                company.Id, companyName, website, city, state, stage, clientType, company.Id 
            ));

            return JSON.serialize(new Map<String, Object>{
                'success' => true,
                'companyId' => company.Id,
                'correlationId' => correlationId,
                'name' => companyName,
                'status' => 'pending'
            });

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
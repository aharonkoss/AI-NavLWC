/**
 * @description Controller for the inputForm LWC.
 *              1. Creates Company__c with Status__c = 'processing'
 *              2. Returns SF record ID to LWC immediately (no waiting on Azure)
 *              3. Enqueues AzureManualCompanyCallout — fires async after commit
 */
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
            // 1. Generate correlation ID
            String correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();

            // 2. Create Company__c
            Company__c company = new Company__c(
                Name             = companyName,
                Website__c       = website,
                City__c          = city,
                State__c         = state,
                Stage__c         = stage,
                Client_Type__c   = clientType,
                Status__c        = 'pending',
                Correlation_Id__c = correlationId
            );
            insert company;

            // 3. If NOT called from a Lead Trigger (i.e., called from LWC), create the Lead
            if (isCalledFromLead == null || !isCalledFromLead) {
                insert new Lead(
                    LastName  = companyName,
                    Company   = companyName,
                    Website   = website,
                    City      = city,
                    State     = state,
                    Country   = 'United States', // ADDED: Required for State/Country Picklists
                    Status    = 'Open - Not Contacted',
                    AIN_Id__c = company.Id
                );
            }

            // 4. Enqueue async callout to Azure
            System.enqueueJob(new AzureManualCompanyCallout(
                company.Id,
                companyName,
                website,
                city,
                state,
                stage,
                clientType,
                company.Id 
            ));

            // 5. Return data to LWC
            return JSON.serialize(new Map<String, Object>{
                'success'       => true,
                'companyId'     => company.Id,
                'correlationId' => correlationId,
                'name'          => companyName,
                'website'       => website,
                'city'          => city,
                'state'         => state,
                'stage'         => stage,
                'clientType'    => clientType,
                'status'        => 'pending',
                'createdAt'     => String.valueOf(DateTime.now())
            });

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'InputController Error: ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }
}
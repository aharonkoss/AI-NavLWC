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
        String clientType
    ) {
        try {
            // 1. Generate correlation ID
            String correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();
            String currentUserId = UserInfo.getUserId();

            // 2. Create Company__c — status pending until Azure confirms
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

            // 3. Enqueue async callout — runs after DML commits
            //    Carries all fields needed to build the Azure payload
            System.enqueueJob(new AzureManualCompanyCallout(
                                company.Id,      // recordId — used to update the Company__c after callout
                                companyName,
                                website,
                                city,
                                state,
                                stage,
                                clientType,
                                company.Id       // salesforceId — echoed back by Azure on every callback
                            ));

            // 4. Return SF record data to LWC immediately
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

        } catch (DmlException dmlEx) {
            System.debug(LoggingLevel.ERROR,
                'InputController.submitCompany DML error: ' + dmlEx.getMessage());
            throw new AuraHandledException(
                'Could not save the company record: ' + dmlEx.getDmlMessage(0)
            );
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'InputController.submitCompany unexpected: ' + e.getMessage());
            throw new AuraHandledException(
                'An unexpected error occurred. Please try again.'
            );
        }
    }
}
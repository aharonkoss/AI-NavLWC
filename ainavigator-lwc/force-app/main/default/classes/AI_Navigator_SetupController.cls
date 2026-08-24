/**
 * @description       : Controller for the AI Navigator Setup LWC.
 *                      Updated to read and write to the unmanaged/local Dev record,
 *                      with a safe fallback to the packaged record.
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 08-17-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class AI_Navigator_SetupController {

    // ── Fetches the current configuration to pre-populate the LWC inputs on load
    @AuraEnabled(cacheable=false)
    public static String getCurrentConfig() {
        try {
            // 1. First, attempt to query the local unmanaged record
            List<AI_Navigator_Config__mdt> configs = [
                SELECT Client_Id__c, Azure_APIM_Base_URL__c, ApimSubscriptionKey__c,
                       Named_Credential_Name__c, Callout_Timeout_Ms__c, Environment__c,
                       Event_Schema_Version__c, Max_Retry_Attempts__c, Is_Active__c
                FROM   AI_Navigator_Config__mdt
                WHERE  DeveloperName = 'Dev'
                AND    NamespacePrefix = null
                LIMIT  1
            ];
            
            // 2. Fall back to the packaged record if no unmanaged record exists yet
            // (e.g. inside the packaging scratch org during build, or on a fresh client installation)
            if (configs.isEmpty()) {
                configs = [
                    SELECT Client_Id__c, Azure_APIM_Base_URL__c, ApimSubscriptionKey__c,
                           Named_Credential_Name__c, Callout_Timeout_Ms__c, Environment__c,
                           Event_Schema_Version__c, Max_Retry_Attempts__c, Is_Active__c
                    FROM   AI_Navigator_Config__mdt
                    WHERE  DeveloperName = 'Dev'
                    LIMIT  1
                ];
            }
            
            if (configs.isEmpty()) {
                return '{}';
            }
            
            AI_Navigator_Config__mdt config = configs[0];
            Map<String, Object> payload = new Map<String, Object>{
                'clientId' => config.Client_Id__c,
                'azureUrl' => config.Azure_APIM_Base_URL__c,
                'subscriptionKey' => config.ApimSubscriptionKey__c,
                'credentialName' => config.Named_Credential_Name__c,
                'timeout' => config.Callout_Timeout_Ms__c,
                'environment' => config.Environment__c,
                'schemaVersion' => config.Event_Schema_Version__c,
                'retryAttempts' => config.Max_Retry_Attempts__c,
                'isActive' => config.Is_Active__c
            };
            return JSON.serialize(payload);
        } catch (Exception e) {
            // Return empty if no record exists yet
            return '{}';
        }
    }

    @AuraEnabled
    public static void saveConfig(String payloadJson) {
        try {
            Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(payloadJson);

            Metadata.DeployContainer mdContainer = new Metadata.DeployContainer();
            Metadata.CustomMetadata customMetadata = new Metadata.CustomMetadata();
            // Targets 'AI_Navigator_Config.Dev' to create/update the local unmanaged record
            customMetadata.fullName = 'AI_Navigator_Config.Dev';
            customMetadata.label = 'Dev';
            
            addValue(customMetadata, 'Client_Id__c', payload.get('clientId'));
            addValue(customMetadata, 'Azure_APIM_Base_URL__c', payload.get('azureUrl'));
            addValue(customMetadata, 'ApimSubscriptionKey__c', payload.get('subscriptionKey'));
            addValue(customMetadata, 'Named_Credential_Name__c', payload.get('credentialName'));
            addValue(customMetadata, 'Callout_Timeout_Ms__c', payload.get('timeout'));
            addValue(customMetadata, 'Environment__c', payload.get('environment'));
            addValue(customMetadata, 'Event_Schema_Version__c', payload.get('schemaVersion'));
            addValue(customMetadata, 'Max_Retry_Attempts__c', payload.get('retryAttempts'));
            addValue(customMetadata, 'Is_Active__c', payload.get('isActive'));

            mdContainer.addMetadata(customMetadata);
            
            if (!Test.isRunningTest()) {
                Id jobId = Metadata.Operations.enqueueDeployment(mdContainer, null);
            }
        } catch (Exception e) {
            throw new AuraHandledException('Setup failed: ' + e.getMessage());
        }
    }

    private static void addValue(Metadata.CustomMetadata customMetadata, String fieldName, Object val) {
        if (val != null) {
            Metadata.CustomMetadataValue valItem = new Metadata.CustomMetadataValue();
            valItem.field = fieldName;
            valItem.value = val;
            customMetadata.values.add(valItem);
        }
    }
}
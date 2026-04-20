/**
 * AI_Navigator_Event_Publisher
 *
 * Shared utility for publishing AI_Navigator_Outbound__e Platform Events.
 * All outbound service classes call this — zero duplication of
 * event construction, config loading, or error handling.
 *
 * Reads config from AI_Navigator_Config__mdt (DeveloperName = 'Dev').
 * Kill switch: if Is_Active__c = false, publish is skipped entirely.
 */
public without sharing class AI_Navigator_Event_Publisher {

    // ── Publish a single outbound event ──────────────────────────────────────
    public static void publish(
        String eventType,
        String msgType,
        String schemaName,
        String payloadJson
    ) {
        publish(eventType, msgType, schemaName, payloadJson, 'NEW');
    }

    // ── Publish with explicit status (NEW or RETRY) ──────────────────────────
    public static void publish(
        String eventType,
        String msgType,
        String schemaName,
        String payloadJson,
        String statusCode
    ) {
        // Load config — fail fast if missing
        AI_Navigator_Config__mdt config = loadConfig();
        if (config == null) {
            System.debug(LoggingLevel.ERROR,
                'AI_Navigator_Event_Publisher: No active config record found. ' +
                'Create an AI_Navigator_Config__mdt record with DeveloperName = Dev.');
            return;
        }

        // Kill switch check
        if (!config.Is_Active__c) {
            System.debug(LoggingLevel.WARN,
                'AI_Navigator_Event_Publisher: Publishing disabled via kill switch. ' +
                'Set Is_Active__c = true on AI_Navigator_Config__mdt to re-enable.');
            return;
        }

        // Validate payload size — Platform Events cap at 32,000 chars
        if (String.isNotBlank(payloadJson) && payloadJson.length() > 32000) {
            System.debug(LoggingLevel.ERROR,
                'AI_Navigator_Event_Publisher: Payload exceeds 32,000 char limit ' +
                'for Event_Type: ' + eventType);
            return;
        }

        // Build the event
        AI_Navigator_Outbound__e evt = new AI_Navigator_Outbound__e(
            Message_Id__c      = generateUUID(),
            Event_Type__c      = eventType,
            Msg_Type__c        = msgType,
            Status_Code__c     = statusCode,
            Client_Id__c       = config.Client_Id__c,
            User_Id__c         = UserInfo.getUserId(),
            Correlation_Id__c  = generateUUID(),
            Content_Type__c    = 'json',
            Schema_Name__c     = schemaName + '.' + config.Event_Schema_Version__c,
            Payload__c         = payloadJson,
            Created_At__c      = DateTime.now()
        );

        // Publish
        Database.SaveResult result = EventBus.publish(evt);

        if (!result.isSuccess()) {
            for (Database.Error err : result.getErrors()) {
                System.debug(LoggingLevel.ERROR,
                    'AI_Navigator_Event_Publisher: Publish failed for ' + eventType +
                    ' | ' + err.getStatusCode() + ': ' + err.getMessage());
            }
        } else {
            System.debug(LoggingLevel.INFO,
                'AI_Navigator_Event_Publisher: Published ' + eventType +
                ' | Correlation: ' + evt.Correlation_Id__c);
        }
    }

    // ── Private: load config ─────────────────────────────────────────────────
    private static AI_Navigator_Config__mdt loadConfig() {
        List<AI_Navigator_Config__mdt> configs = [
            SELECT Client_Id__c, Azure_APIM_Base_URL__c, Named_Credential_Name__c,
                   Max_Retry_Attempts__c, Callout_Timeout_Ms__c,
                   Event_Schema_Version__c, Is_Active__c
            FROM AI_Navigator_Config__mdt
            WHERE DeveloperName = 'Dev'
            LIMIT 1
        ];
        return configs.isEmpty() ? null : configs[0];
    }

    // ── Private: generate UUID v4 ────────────────────────────────────────────
    // Salesforce has no native UUID generator so we build one from Crypto
    public static String generateUUID() {
        Blob b = Crypto.generateAesKey(128);
        String hex = EncodingUtil.convertToHex(b);
        return hex.substring(0,8)  + '-' +
               hex.substring(8,12) + '-' +
               '4' + hex.substring(13,16) + '-' +
               hex.substring(16,20) + '-' +
               hex.substring(20,32);
    }
}
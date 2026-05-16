/**
 * @description Shared service for publishing AI_Navigator_Outbound__e Platform Events.
 *              All outbound event publishing flows through this class so schema versioning
 *              and correlation ID generation are centralized.
 *
 * @group AI Navigator Integration
 * @last-modified 2026-04-27
 */
public with sharing class AiNavigatorEventService {

    /**
     * @description Publishes a single AI_Navigator_Outbound__e event.
     *
     * @param eventType    The event type string (e.g. 'RESEARCH_REQUEST', 'UPLOAD')
     * @param schemaName   The payload schema version (e.g. 'ResearchRequest.v1')
     * @param payload      Map of fields to serialize as the JSON payload
     * @param correlationId Caller-supplied correlation ID already stamped on the SObject
     */
    public static void publish(
        String eventType,
        String schemaName,
        Map<String, Object> payload,
        String correlationId
    ) {
        // Always embed correlationId and schemaVersion inside the payload itself
        // so Azure has everything it needs without reading envelope fields separately.
        payload.put('correlationId',  correlationId);
        payload.put('schemaVersion',  schemaName);

        AI_Navigator_Outbound__e evt = new AI_Navigator_Outbound__e(
            Event_Type__c    = eventType,
            Schema_Name__c   = schemaName,
            Payload__c      = JSON.serialize(payload),
            Correlation_Id__c = correlationId
        );

        Database.SaveResult sr = EventBus.publish(evt);
        if (!sr.isSuccess()) {
            String errMsg = sr.getErrors()[0].getMessage();
            System.debug(LoggingLevel.ERROR,
                'AiNavigatorEventService: Failed to publish ' + eventType
                + ' | correlationId=' + correlationId + ' | error=' + errMsg);
            throw new AuraHandledException(
                'Failed to send request to processing pipeline. Please try again. ' + errMsg
            );
        }
        System.debug(LoggingLevel.INFO,
            'AiNavigatorEventService: Published ' + eventType
            + ' | schema=' + schemaName + ' | correlationId=' + correlationId);
    }

    /**
     * @description Generates a Salesforce-owned correlation ID in the format
     *              Azure expects for end-to-end trace correlation.
     *
     *   Format  : SF-{unix-ms}-{8-char-lowercase-hex}
     *   Example : SF-1714060800000-a3f9d2c1
     *
     *   The 8-char hex tail provides ~4 billion values per millisecond bucket —
     *   sufficient entropy for trace correlation per Azure spec v2.
     *
     *   CHANGE FROM PREVIOUS VERSION:
     *     Old: 4-char uppercase hex  → SF-1745271600000-A3F2
     *     New: 8-char lowercase hex  → SF-1714060800000-a3f9d2c1
     *     Reason: Azure developer confirmed format requirement 2026-04-27.
     */
    public static String generateCorrelationId() {
        String ts   = String.valueOf(DateTime.now().getTime());
        String rand = EncodingUtil.convertToHex(
                          Crypto.generateAesKey(128)
                      ).substring(0, 8).toLowerCase();
        return 'SF-' + ts + '-' + rand;
    }
}
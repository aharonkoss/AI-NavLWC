/**
 * @description Shared service for publishing AI_Navigator_Outbound__e Platform Events.
 *              All outbound event publishing flows through this class so schema versioning
 *              and correlation ID generation are centralized.
 *
 *              v2 change: generateCorrelationId() now produces a pinned format:
 *                  SF-{unix-ms}-{8-char-lowercase-hex}
 *              e.g. SF-1714060800000-a3f9d2c1
 *              This matches the X-Correlation-Id contract in ai-navigator-openapi_v2.yaml
 *              and ai-navigator-event-schemas_v2.yaml so logs join cleanly across SF and Azure.
 *
 * @group AI Navigator - Integration
 * @last-modified 2026-04-25
 */
public with sharing class AiNavigatorEventService {

    // -------------------------------------------------------------------------
    // Publish
    // -------------------------------------------------------------------------

    /**
     * @description Publishes a single AI_Navigator_Outbound__e event.
     * @param eventType   The event type string (e.g. RESEARCH_REQUEST, UPLOAD)
     * @param schemaName  The payload schema version (e.g. ResearchRequest.v1)
     * @param payload     Map of fields to serialize as the JSON payload
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
        payload.put('correlationId', correlationId);
        payload.put('schemaVersion', schemaName);

        AI_Navigator_Outbound__e evt = new AI_Navigator_Outbound__e(
            Event_Type__c     = eventType,
            Schema_Name__c    = schemaName,
            Payload__c       = JSON.serialize(payload),
            Correlation_Id__c = correlationId
        );

        Database.SaveResult sr = EventBus.publish(evt);

        if (!sr.isSuccess()) {
            String errMsg = sr.getErrors()[0].getMessage();
            System.debug(LoggingLevel.ERROR,
                'AiNavigatorEventService: Failed to publish ' + eventType +
                ' | correlationId=' + correlationId + ' | error=' + errMsg);
            throw new AuraHandledException(
                'Failed to send request to processing pipeline. Please try again. ' + errMsg
            );
        }

        System.debug(LoggingLevel.INFO,
            'AiNavigatorEventService: Published ' + eventType +
            ' | schema=' + schemaName + ' | correlationId=' + correlationId);
    }

    // -------------------------------------------------------------------------
    // Correlation ID generation
    // -------------------------------------------------------------------------

    /**
     * @description Generates a Salesforce-owned correlation ID.
     *
     *   Format  : SF-{unix-ms}-{8-char-lowercase-hex}
     *   Example : SF-1714060800000-a3f9d2c1
     *   Max len : 36 chars — fits Correlation_Id__c (Text 36) on both platform events.
     *
     *   v2 change from v1:
     *     - Hex segment extended from 4 chars (uppercase) → 8 chars (lowercase)
     *     - Matches the pinned format in ai-navigator-openapi_v2.yaml info.description
     *       so X-Correlation-Id headers and Platform Event fields join cleanly in Azure logs.
     *
     * @return Correlation ID string
     */
    public static String generateCorrelationId() {
        String ts   = String.valueOf(DateTime.now().getTime());           // unix-ms
        String rand = EncodingUtil.convertToHex(
                          Crypto.generateAesKey(128)                     // 16 random bytes
                      ).substring(0, 8).toLowerCase();                   // 8-char lowercase hex
        return 'SF-' + ts + '-' + rand;
        // Example output: SF-1714060800000-a3f9d2c1  (30 chars — well within Text 36)
    }
}
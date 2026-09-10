/**
 * @description Shared service for publishing AI_Navigator_Outbound__e Platform Events.
 *              All outbound event publishing flows through this class so schema versioning
 *              and correlation ID generation are centralized.
 *
 * @group AI Navigator Integration
 * @last-modified 2026-09-08
 */
public with sharing class AiNavigatorEventService {

    /**
     * @description Publishes a single AI_Navigator_Outbound__e event.
     *
     * @param eventType     The event type string (e.g. 'RESEARCH_REQUEST', 'UPLOAD')
     * @param schemaName    The payload schema version (e.g. 'ResearchRequest.v1')
     * @param payload       Map of fields to serialize as the JSON payload
     * @param correlationId Caller-supplied correlation ID already stamped on the SObject
     */
    public static void publish(
        String eventType,
        String schemaName,
        Map<String, Object> payload,
        String correlationId
    ) {
        if (payload == null) {
            payload = new Map<String, Object>();
        }

        // Ensure correlationId is never empty
        String activeCorrelationId = String.isNotBlank(correlationId) 
            ? correlationId 
            : generateCorrelationId();

        // Always embed correlationId and schemaVersion inside the payload itself
        // so Azure has everything it needs without reading envelope fields separately.
        payload.put('correlationId', activeCorrelationId);
        payload.put('schemaVersion', schemaName);

        AI_Navigator_Outbound__e evt = new AI_Navigator_Outbound__e(
            Event_Type__c     = eventType,
            Schema_Name__c    = schemaName,
            Payload__c        = JSON.serialize(payload),
            Correlation_Id__c = activeCorrelationId
        );

        Database.SaveResult sr = EventBus.publish(evt);
        if (!sr.isSuccess()) {
            String errMsg = '';
            for (Database.Error err : sr.getErrors()) {
                errMsg += err.getMessage() + '; ';
            }
            errMsg = errMsg.removeEnd('; ');

            System.debug(LoggingLevel.ERROR,
                'AiNavigatorEventService: Failed to publish ' + eventType
                + ' | correlationId=' + activeCorrelationId + ' | error=' + errMsg);
            
            AuraHandledException ahe = new AuraHandledException(
                'Failed to send request to processing pipeline: ' + errMsg
            );
            ahe.setMessage('Failed to send request to processing pipeline: ' + errMsg);
            throw ahe;
        }

        System.debug(LoggingLevel.INFO,
            'AiNavigatorEventService: Published ' + eventType
            + ' | schema=' + schemaName + ' | correlationId=' + activeCorrelationId);
    }

    /**
     * @description Bulk publishes a list of AI_Navigator_Outbound__e events.
     * @param events List of Platform Event records to publish
     * @return List<Database.SaveResult> Results of the publish operation
     */
    public static List<Database.SaveResult> publish(List<AI_Navigator_Outbound__e> events) {
        if (events == null || events.isEmpty()) {
            return new List<Database.SaveResult>();
        }
        return EventBus.publish(events);
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
     */
    public static String generateCorrelationId() {
        String ts   = String.valueOf(DateTime.now().getTime());
        String rand = EncodingUtil.convertToHex(
                          Crypto.generateAesKey(128)
                      ).substring(0, 8).toLowerCase();
        return 'SF-' + ts + '-' + rand;
    }
}
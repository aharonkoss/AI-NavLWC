/**
 * SignalAlertProcessor
 *
 * Handles SIGNAL_ALERT inbound events from Azure.
 * Creates Signal__c child records under the matching Company__c.
 * Bulkified — processes multiple events and multiple signals per event.
 */
public without sharing class SignalAlertProcessor {

    public static void processSignalAlerts(List<AI_Navigator_Inbound__e> events) {

        // Step 1 — collect all companyIds from payloads
        Map<String, List<Map<String, Object>>> companyIdToSignals =
            new Map<String, List<Map<String, Object>>>();

        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String companyId = (String) payload.get('companyId');
            if (String.isBlank(companyId)) continue;

            List<Object> rawSignals = (List<Object>) payload.get('signals');
            if (rawSignals == null || rawSignals.isEmpty()) continue;

            List<Map<String, Object>> signalMaps = new List<Map<String, Object>>();
            for (Object s : rawSignals) {
                signalMaps.add((Map<String, Object>) s);
            }

            if (!companyIdToSignals.containsKey(companyId)) {
                companyIdToSignals.put(companyId, new List<Map<String, Object>>());
            }
            companyIdToSignals.get(companyId).addAll(signalMaps);
        }

        if (companyIdToSignals.isEmpty()) return;

        // Step 2 — verify companies exist
        Set<Id> validCompanyIds = new Set<Id>();
        for (Company__c c : [
            SELECT Id FROM Company__c
            WHERE Id IN :companyIdToSignals.keySet()
        ]) {
            validCompanyIds.add(c.Id);
        }

        // Step 3 — build Signal__c records
        List<Signal__c> toInsert = new List<Signal__c>();

        for (String companyId : companyIdToSignals.keySet()) {
            if (!validCompanyIds.contains((Id) companyId)) continue;

            for (Map<String, Object> s : companyIdToSignals.get(companyId)) {
                toInsert.add(new Signal__c(
                    Company__c    = (Id) companyId,
                    Signal_Type__c = (String)  s.get('signalType'),
                    Headline__c   = (String)  s.get('headline'),
                    Impact__c     = (String)  s.get('impact'),
                    Priority__c   = (String)  s.get('priority'),
                    Source__c     = (String)  s.get('source'),
                    Detected_At__c = parseDateTime(s.get('detectedAt')),
                    Is_New__c     = true
                ));
            }
        }

        if (toInsert.isEmpty()) return;

        try {
            insert toInsert;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                'SignalAlertProcessor: DML failed. ' + de.getMessage());
        }
    }

    // ── Private Helpers ──────────────────────────────────────────────────────
    private static Map<String, Object> parsePayload(String payloadJson) {
        if (String.isBlank(payloadJson)) return new Map<String, Object>();
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(payloadJson);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'SignalAlertProcessor: Failed to parse payload. ' + e.getMessage());
            return new Map<String, Object>();
        }
    }

    private static DateTime parseDateTime(Object val) {
        if (val == null) return DateTime.now();
        try {
            return (DateTime) JSON.deserialize('"' + String.valueOf(val) + '"', DateTime.class);
        } catch (Exception e) {
            return DateTime.now();
        }
    }
}
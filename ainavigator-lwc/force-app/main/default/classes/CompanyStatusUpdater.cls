/**
 * @description Handles inbound Platform Events that update Company__c records.
 *
 *   Supported event types:
 *     - RESEARCH_DONE         → Status__c = completed/failed, Research_Completed_At__c
 *     - SCORING_DONE          → Prospect_Score__c, Scored_At__c
 *     - REPORT_READY          → PDF_Report_URL__c  (or report_failed if code indicates failure)
 *     - PROCESSING_ERROR      → Status__c = failed, Error_Message__c
 *
 *   LOOKUP STRATEGY:
 *     All handlers match on Correlation_Id__c — a dedicated field on the Platform
 *     Event that Azure echoes back from the original upload request.
 *     It is stored on Company__c at record-creation time, enabling a direct
 *     WHERE Correlation_Id__c IN lookup with no Azure changes required.
 *
 * @group AI Navigator Integration
 * @last-modified 2026-05-04
 */
public without sharing class CompanyStatusUpdater {

    // ─────────────────────────────────────────────────────────────────────────
    // RESEARCH_DONE
    // ─────────────────────────────────────────────────────────────────────────
    public static void processResearchDone(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = mapByCorrelationId(events);
        if (corrIdToEvent.isEmpty()) return;

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        for (AI_Navigator_Company__c company : [
            SELECT Id, Status__c, Research_Completed_At__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt     = corrIdToEvent.get(company.Correlation_Id__c);
            Map<String, Object>     payload = parsePayload(evt.Payload__c);

            String status = (String) payload.get('status');
            if (status == 'failed') {
                company.Status__c        = 'failed';
                company.Error_Message__c = extractErrorMessage(payload);
            } else {
                company.Status__c                = 'completed';
                company.Research_Completed_At__c = DateTime.now();
                company.Error_Message__c         = null; // clear any prior error
            }
            company.Azure_Company_Id__c = (String) payload.get('companyId');
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processResearchDone');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCORING_DONE
    // ─────────────────────────────────────────────────────────────────────────
    public static void processScoringDone(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = mapByCorrelationId(events);
        if (corrIdToEvent.isEmpty()) return;

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        for (AI_Navigator_Company__c company : [
            SELECT Id, Prospect_Score__c, Scored_At__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt     = corrIdToEvent.get(company.Correlation_Id__c);
            Map<String, Object>     payload = parsePayload(evt.Payload__c);

            Object scoreVal = payload.get('overallScore');
            if (scoreVal != null) {
                company.Prospect_Score__c = Decimal.valueOf(String.valueOf(scoreVal));
                company.Scored_At__c      = DateTime.now();
                company.Error_Message__c  = null;
            } else {
                company.Error_Message__c = extractErrorMessage(payload);
            }
            company.Azure_Company_Id__c = (String) payload.get('companyId');
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processScoringDone');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REPORT_READY  (also handles AI_NAVIGATOR_REPORT_FAILED inside this event)
    // ─────────────────────────────────────────────────────────────────────────
    public static void processReportReady(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = mapByCorrelationId(events);
        if (corrIdToEvent.isEmpty()) return;

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        for (AI_Navigator_Company__c company : [
            SELECT Id, Status__c, PDF_Report_URL__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt     = corrIdToEvent.get(company.Correlation_Id__c);
            Map<String, Object>     payload = parsePayload(evt.Payload__c);
            String                  code    = (String) payload.get('code');

            // Azure sometimes sends failure inside a REPORT_READY event
            if (code != null && code.containsIgnoreCase('FAILED')) {
                company.Status__c        = 'report_failed';
                company.Error_Message__c = extractErrorMessage(payload);
            } else if (evt.Content_Type__c == 'uri') {
                company.PDF_Report_URL__c = evt.Payload__c;
                company.Error_Message__c  = null;
            } else {
                company.PDF_Report_URL__c = (String) payload.get('downloadUrl');
                company.Error_Message__c  = null;
            }
            company.Azure_Company_Id__c = (String) payload.get('companyId');
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processReportReady');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROCESSING_ERROR
    // ─────────────────────────────────────────────────────────────────────────
    public static void processError(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = mapByCorrelationId(events);
        if (corrIdToEvent.isEmpty()) return;

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        for (AI_Navigator_Company__c company : [
            SELECT Id, Status__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt     = corrIdToEvent.get(company.Correlation_Id__c);
            Map<String, Object>     payload = parsePayload(evt.Payload__c);

            company.Status__c           = 'failed';
            company.Error_Message__c    = extractErrorMessage(payload);
            company.Azure_Company_Id__c = (String) payload.get('companyId');
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processError');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private static Map<String, AI_Navigator_Inbound__e> mapByCorrelationId(
        List<AI_Navigator_Inbound__e> events
    ) {
        Map<String, AI_Navigator_Inbound__e> result = new Map<String, AI_Navigator_Inbound__e>();
        for (AI_Navigator_Inbound__e evt : events) {
            if (String.isNotBlank(evt.Correlation_Id__c)) {
                result.put(evt.Correlation_Id__c, evt);
            }
        }
        return result;
    }

    /**
     * @description Extracts a clean, user-friendly error message from the payload.
     *              Prefers 'message' field, falls back to 'code', then a generic string.
     *              Truncates to 255 chars to fit a standard text field.
     */
    private static String extractErrorMessage(Map<String, Object> payload) {
        String msg  = (String) payload.get('message');
        String code = (String) payload.get('code');
        String raw  = String.isNotBlank(msg) ? msg
                    : String.isNotBlank(code) ? code
                    : 'Azure processing error — no details provided';
        // Strip HTML tags Azure sometimes includes in error messages
        raw = raw.replaceAll('<[^>]+>', '').trim();
        return raw.length() > 255 ? raw.substring(0, 255) : raw;
    }

    private static Map<String, Object> parsePayload(String payloadJson) {
        if (String.isBlank(payloadJson)) return new Map<String, Object>();
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(payloadJson);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'CompanyStatusUpdater: Failed to parse payload. ' + e.getMessage());
            return new Map<String, Object>();
        }
    }

    private static void updateRecords(List<AI_Navigator_Company__c> records, String context) {
        if (records.isEmpty()) return;
        try {
            update records;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                context + ': DML failed. ' + de.getMessage());
        }
    }
}
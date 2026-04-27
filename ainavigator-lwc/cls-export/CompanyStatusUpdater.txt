/**
 * CompanyStatusUpdater
 *
 * Handles inbound Platform Events that update Company__c records:
 *   - RESEARCH_DONE   → Status = completed/failed, timestamp
 *   - SCORING_DONE    → Prospect_Score__c, Scored_At__c
 *   - REPORT_READY    → PDF_Report_URL__c
 *   - PROCESSING_ERROR → Status = failed, Error logged
 */
public without sharing class CompanyStatusUpdater {

    // ── RESEARCH_DONE ────────────────────────────────────────────────────────
    public static void processResearchDone(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();

        for (Company__c company : [
            SELECT Id, Status__c, Research_Completed_At__c, Correlation_Id__c
            FROM Company__c
            WHERE Id IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = companyIdToEvent.get(company.Id);
            Map<String, Object> payload = parsePayload(evt.Payload__c);

            String status = (String) payload.get('status');
            company.Status__c               = (status == 'failed') ? 'failed' : 'completed';
            company.Research_Completed_At__c = DateTime.now();
            company.Correlation_Id__c        = evt.Correlation_Id__c;
            toUpdate.add(company);
        }

        updateRecords(toUpdate, 'CompanyStatusUpdater.processResearchDone');
    }

    // ── SCORING_DONE ─────────────────────────────────────────────────────────
    public static void processScoringDone(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();

        for (Company__c company : [
            SELECT Id, Prospect_Score__c, Scored_At__c, Correlation_Id__c
            FROM Company__c
            WHERE Id IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = companyIdToEvent.get(company.Id);
            Map<String, Object> payload = parsePayload(evt.Payload__c);

            Object scoreVal = payload.get('overallScore');
            if (scoreVal != null) {
                company.Prospect_Score__c = Decimal.valueOf(String.valueOf(scoreVal));
            }
            company.Scored_At__c      = DateTime.now();
            company.Correlation_Id__c = evt.Correlation_Id__c;
            toUpdate.add(company);
        }

        updateRecords(toUpdate, 'CompanyStatusUpdater.processScoringDone');
    }

    // ── REPORT_READY ─────────────────────────────────────────────────────────
    public static void processReportReady(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();

        for (Company__c company : [
            SELECT Id, PDF_Report_URL__c, Correlation_Id__c
            FROM Company__c
            WHERE Id IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = companyIdToEvent.get(company.Id);

            // If Content_Type__c is 'uri' the payload IS the URL directly
            if (evt.Content_Type__c == 'uri') {
                company.PDF_Report_URL__c = evt.Payload__c;
            } else {
                Map<String, Object> payload = parsePayload(evt.Payload__c);
                company.PDF_Report_URL__c  = (String) payload.get('downloadUrl');
            }

            company.Correlation_Id__c = evt.Correlation_Id__c;
            toUpdate.add(company);
        }

        updateRecords(toUpdate, 'CompanyStatusUpdater.processReportReady');
    }

    // ── PROCESSING_ERROR ─────────────────────────────────────────────────────
    public static void processError(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();

        for (Company__c company : [
            SELECT Id, Status__c, Correlation_Id__c
            FROM Company__c
            WHERE Id IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = companyIdToEvent.get(company.Id);
            company.Status__c         = 'failed';
            company.Correlation_Id__c = evt.Correlation_Id__c;
            toUpdate.add(company);
        }

        updateRecords(toUpdate, 'CompanyStatusUpdater.processError');
    }

    // ── Private Helpers ──────────────────────────────────────────────────────
    private static Map<String, AI_Navigator_Inbound__e> mapByCompanyId(
        List<AI_Navigator_Inbound__e> events
    ) {
        Map<String, AI_Navigator_Inbound__e> result = new Map<String, AI_Navigator_Inbound__e>();
        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String companyId = (String) payload.get('companyId');
            if (String.isNotBlank(companyId)) {
                result.put(companyId, evt);
            }
        }
        return result;
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

    private static void updateRecords(List<Company__c> records, String context) {
        if (records.isEmpty()) return;
        try {
            update records;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                context + ': DML failed. ' + de.getMessage());
        }
    }
}
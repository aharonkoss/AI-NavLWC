/**
 * @description Handles inbound Platform Events that update Company__c records.
 *
 *   Supported event types:
 *     - RESEARCH_DONE     → Status__c = completed/failed, ResearchCompletedAt__c
 *     - SCORING_DONE      → Prospect_Score__c, Scored_At__c
 *     - REPORT_READY      → PDF_Report_URL__c
 *     - PROCESSING_ERROR  → Status__c = failed
 *
 *   KEY CHANGE 2026-04-28:
 *     All four handlers now query Company__c by Azure_Company_Id__c (Azure's UUID)
 *     instead of the Salesforce record Id.
 *
 *     Root cause: InputController previously sent SF's record Id as `companyId` to Azure.
 *     Azure generates its own UUID and echoes THAT back in all callbacks. Since SF's Id
 *     and Azure's UUID never matched, no Company__c records were ever updated by callbacks.
 *
 *     Fix: mapByCompanyId() extracts Azure's companyId from the payload (unchanged).
 *     Each handler now does:  WHERE Azure_Company_Id__c IN :companyIdToEvent.keySet()
 *     which correctly resolves Azure's UUID → our Company__c record.
 *
 * @group AI Navigator Integration
 * @last-modified 2026-04-28
 */
public without sharing class CompanyStatusUpdater {

    // ─────────────────────────────────────────────────────────────────────────
    // RESEARCH_DONE
    // ─────────────────────────────────────────────────────────────────────────
    public static void processResearchDone(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();
        for (Company__c company : [
            SELECT Id, Status__c, Research_Completed_At__c,
                Correlation_Id__c, Azure_Company_Id__c   // ← ADD THIS
            FROM   Company__c
            WHERE  Azure_Company_Id__c IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt     = companyIdToEvent.get(company.Azure_Company_Id__c);
            Map<String, Object>     payload = parsePayload(evt.Payload__c);
            String status = (String) payload.get('status');
            company.Status__c                = (status == 'failed') ? 'failed' : 'completed';
            company.Research_Completed_At__c = DateTime.now();
            company.Correlation_Id__c        = evt.Correlation_Id__c;
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processResearchDone');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCORING_DONE
    // ─────────────────────────────────────────────────────────────────────────
    public static void processScoringDone(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();
        for (Company__c company : [
            SELECT Id, Prospect_Score__c, Scored_At__c, Correlation_Id__c, Azure_Company_Id__c
            FROM   Company__c
            WHERE  Azure_Company_Id__c IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt    = companyIdToEvent.get(company.Azure_Company_Id__c);
            Map<String, Object>     payload = parsePayload(evt.Payload__c);
            Object scoreVal = payload.get('overallScore');
            if (scoreVal != null) {
                company.Prospect_Score__c = Decimal.valueOf(String.valueOf(scoreVal));
            }
            company.Scored_At__c     = DateTime.now();
            company.Correlation_Id__c = evt.Correlation_Id__c;
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processScoringDone');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REPORT_READY
    // ─────────────────────────────────────────────────────────────────────────
    public static void processReportReady(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();
        for (Company__c company : [
            SELECT Id, PDF_Report_URL__c, Correlation_Id__c, Azure_Company_Id__c
            FROM   Company__c
            WHERE  Azure_Company_Id__c IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = companyIdToEvent.get(company.Azure_Company_Id__c);
            // If Content_Type__c is 'uri' the payload IS the URL directly
            if (evt.Content_Type__c == 'uri') {
                company.PDF_Report_URL__c = evt.Payload__c;
            } else {
                Map<String, Object> payload = parsePayload(evt.Payload__c);
                company.PDF_Report_URL__c = (String) payload.get('downloadUrl');
            }
            company.Correlation_Id__c = evt.Correlation_Id__c;
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processReportReady');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROCESSING_ERROR
    // ─────────────────────────────────────────────────────────────────────────
    public static void processError(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> companyIdToEvent = mapByCompanyId(events);
        if (companyIdToEvent.isEmpty()) return;

        List<Company__c> toUpdate = new List<Company__c>();
        for (Company__c company : [
            SELECT Id, Status__c, Correlation_Id__c, Azure_Company_Id__c
            FROM   Company__c
            WHERE  Azure_Company_Id__c IN :companyIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = companyIdToEvent.get(company.Azure_Company_Id__c);
            company.Status__c        = 'failed';
            company.Correlation_Id__c = evt.Correlation_Id__c;
            toUpdate.add(company);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processError');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @description Extracts Azure's companyId from each event payload and builds
     *              a map of azureCompanyId → event for O(1) lookup in each handler.
     */
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
            System.debug(LoggingLevel.ERROR, context + ': DML failed. ' + de.getMessage());
        }
    }
}
/**
 * SubmissionProgressUpdater
 *
 * Handles inbound Platform Events that update Submission__c records:
 *   - UPLOAD_PROCESSED → Final status, completed/partial/failed counts
 *   - BATCH_PROGRESS   → Interim processed count for progress bar
 */
public without sharing class SubmissionProgressUpdater {

    // ── UPLOAD_PROCESSED ─────────────────────────────────────────────────────
    public static void processUploadComplete(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> subIdToEvent = mapBySubmissionId(events);
        if (subIdToEvent.isEmpty()) return;

        List<Submission__c> toUpdate = new List<Submission__c>();

        for (Submission__c sub : [
            SELECT Id, Submission_Id__c, Status__c,
                   Total_Companies__c, Processed_Companies__c,
                   Failed_Companies__c, Completed_At__c
            FROM Submission__c
            WHERE Submission_Id__c IN :subIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = subIdToEvent.get(sub.Submission_Id__c);
            Map<String, Object> payload = parsePayload(evt.Payload__c);

            Integer total     = intVal(payload.get('totalCompanies'));
            Integer completed = intVal(payload.get('completed'));
            Integer failed    = intVal(payload.get('failed'));

            sub.Total_Companies__c     = total;
            sub.Processed_Companies__c = completed;
            sub.Failed_Companies__c    = failed;
            sub.Completed_At__c        = DateTime.now();

            // Determine final status
            if (failed == 0) {
                sub.Status__c = 'completed';
            } else if (completed > 0) {
                sub.Status__c = 'partial';
            } else {
                sub.Status__c = 'failed';
            }

            toUpdate.add(sub);
        }

        updateRecords(toUpdate, 'SubmissionProgressUpdater.processUploadComplete');
    }

    // ── BATCH_PROGRESS ───────────────────────────────────────────────────────
    public static void processBatchProgress(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> subIdToEvent = mapBySubmissionId(events);
        if (subIdToEvent.isEmpty()) return;

        List<Submission__c> toUpdate = new List<Submission__c>();

        for (Submission__c sub : [
            SELECT Id, Submission_Id__c, Status__c,
                   Total_Companies__c, Processed_Companies__c,
                   Failed_Companies__c
            FROM Submission__c
            WHERE Submission_Id__c IN :subIdToEvent.keySet()
        ]) {
            AI_Navigator_Inbound__e evt = subIdToEvent.get(sub.Submission_Id__c);
            Map<String, Object> payload = parsePayload(evt.Payload__c);

            sub.Total_Companies__c     = intVal(payload.get('total'));
            sub.Processed_Companies__c = intVal(payload.get('processed'));
            sub.Failed_Companies__c    = intVal(payload.get('failed'));
            sub.Status__c              = 'processing';
            toUpdate.add(sub);
        }

        updateRecords(toUpdate, 'SubmissionProgressUpdater.processBatchProgress');
    }

    // ── Private Helpers ──────────────────────────────────────────────────────
    private static Map<String, AI_Navigator_Inbound__e> mapBySubmissionId(
        List<AI_Navigator_Inbound__e> events
    ) {
        Map<String, AI_Navigator_Inbound__e> result = new Map<String, AI_Navigator_Inbound__e>();
        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String submissionId = (String) payload.get('submissionId');
            if (String.isNotBlank(submissionId)) {
                result.put(submissionId, evt);
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
                'SubmissionProgressUpdater: Failed to parse payload. ' + e.getMessage());
            return new Map<String, Object>();
        }
    }

    private static Integer intVal(Object val) {
        if (val == null) return 0;
        return Integer.valueOf(String.valueOf(val));
    }

    private static void updateRecords(List<Submission__c> records, String context) {
        if (records.isEmpty()) return;
        try {
            update records;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                context + ': DML failed. ' + de.getMessage());
        }
    }
}
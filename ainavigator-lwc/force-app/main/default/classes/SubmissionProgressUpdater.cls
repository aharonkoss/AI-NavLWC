/**
 * SubmissionProgressUpdater
 *
 * Handles inbound Platform Events that update Submission__c and Company__c records:
 *   - UPLOAD_PROCESSED → Final status, counts, and stamps Azure_Company_Id__c on companies
 *   - BATCH_PROGRESS   → Interim processed count for progress bar
 */
public without sharing class SubmissionProgressUpdater {

    // ── UPLOAD_PROCESSED ─────────────────────────────────────────────────────
    public static void processUploadComplete(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> subIdToEvent = mapBySubmissionId(events);
        if (subIdToEvent.isEmpty()) return;

        List<AI_Navigator_Submission__c> subsToUpdate = new List<AI_Navigator_Submission__c>();
        Map<Id, String> salesforceIdToAzureId = new Map<Id, String>();
        Map<Id, String> salesforceIdToFailedReason = new Map<Id, String>();

        for (AI_Navigator_Submission__c sub : [
            SELECT Id, Submission_Id__c, Status__c,
                   Total_Companies__c, Processed_Companies__c,
                   Failed_Companies__c, Completed_At__c
            FROM AI_Navigator_Submission__c
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

            if (failed == 0) {
                sub.Status__c = 'completed';
            } else if (completed > 0) {
                sub.Status__c = 'partial';
            } else {
                sub.Status__c = 'failed';
            }

            subsToUpdate.add(sub);

            // 1. Extract completed companies (1-to-1 Salesforce ID to Azure UUID mapping)
            if (payload.containsKey('completedCompanies') && payload.get('completedCompanies') instanceof List<Object>) {
                for (Object compObj : (List<Object>) payload.get('completedCompanies')) {
                    if (compObj instanceof Map<String, Object>) {
                        Map<String, Object> cMap = (Map<String, Object>) compObj;
                        String sfId = (String) cMap.get('salesforceId');
                        String azId = (String) cMap.get('companyId');
                        if (String.isNotBlank(sfId) && String.isNotBlank(azId)) {
                            try {
                                salesforceIdToAzureId.put((Id) sfId.trim(), azId.trim());
                            } catch (Exception e) {
                                System.debug(LoggingLevel.WARN, 'Invalid salesforceId in completedCompanies: ' + sfId);
                            }
                        }
                    }
                }
            }

            // 2. Extract failed companies
            if (payload.containsKey('failedCompanies') && payload.get('failedCompanies') instanceof List<Object>) {
                for (Object compObj : (List<Object>) payload.get('failedCompanies')) {
                    if (compObj instanceof Map<String, Object>) {
                        Map<String, Object> cMap = (Map<String, Object>) compObj;
                        String sfId = (String) cMap.get('salesforceId');
                        String reason = (String) cMap.get('reason');
                        if (String.isNotBlank(sfId)) {
                            try {
                                salesforceIdToFailedReason.put((Id) sfId.trim(), String.isNotBlank(reason) ? reason : 'Upload processing failed');
                            } catch (Exception e) {
                                System.debug(LoggingLevel.WARN, 'Invalid salesforceId in failedCompanies: ' + sfId);
                            }
                        }
                    }
                }
            }
        }

        // Update Submissions
        updateRecords(subsToUpdate, 'SubmissionProgressUpdater.processUploadComplete (Submissions)');

        // Update Company Records with their distinct Azure IDs
        if (!salesforceIdToAzureId.isEmpty() || !salesforceIdToFailedReason.isEmpty()) {
            Set<Id> targetCompanyIds = new Set<Id>();
            targetCompanyIds.addAll(salesforceIdToAzureId.keySet());
            targetCompanyIds.addAll(salesforceIdToFailedReason.keySet());

            List<AI_Navigator_Company__c> companiesToUpdate = new List<AI_Navigator_Company__c>();
            for (AI_Navigator_Company__c comp : [
                SELECT Id, Azure_Company_Id__c, Status__c, Research_Completed_At__c, Error_Message__c
                FROM AI_Navigator_Company__c
                WHERE Id IN :targetCompanyIds
            ]) {
                if (salesforceIdToAzureId.containsKey(comp.Id)) {
                    comp.Azure_Company_Id__c        = salesforceIdToAzureId.get(comp.Id);
                    comp.Status__c                  = 'completed';
                    comp.Research_Completed_At__c   = DateTime.now();
                    comp.Error_Message__c           = null;
                    companiesToUpdate.add(comp);
                } else if (salesforceIdToFailedReason.containsKey(comp.Id)) {
                    comp.Status__c                  = 'failed';
                    comp.Error_Message__c           = salesforceIdToFailedReason.get(comp.Id);
                    companiesToUpdate.add(comp);
                }
            }

            updateRecords(companiesToUpdate, 'SubmissionProgressUpdater.processUploadComplete (Companies)');
        }
    }

    // ── BATCH_PROGRESS ───────────────────────────────────────────────────────
    public static void processBatchProgress(List<AI_Navigator_Inbound__e> events) {
        Map<String, AI_Navigator_Inbound__e> subIdToEvent = mapBySubmissionId(events);
        if (subIdToEvent.isEmpty()) return;

        List<AI_Navigator_Submission__c> toUpdate = new List<AI_Navigator_Submission__c>();

        for (AI_Navigator_Submission__c sub : [
            SELECT Id, Submission_Id__c, Status__c,
                   Total_Companies__c, Processed_Companies__c,
                   Failed_Companies__c
            FROM AI_Navigator_Submission__c
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
            if (String.isBlank(submissionId)) {
                submissionId = evt.Correlation_Id__c;
            }
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

    private static void updateRecords(List<SObject> records, String context) {
        if (records.isEmpty()) return;
        try {
            update records;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                context + ': DML failed. ' + de.getMessage());
        }
    }
}
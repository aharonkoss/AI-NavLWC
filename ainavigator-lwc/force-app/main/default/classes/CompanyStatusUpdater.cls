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
 *     Matches by salesforceId first, then Azure_Company_Id__c, then Correlation_Id__c.
 *
 * @group AI Navigator Integration
 * @last-modified 2026-09-08
 */
public without sharing class CompanyStatusUpdater {

    // ─────────────────────────────────────────────────────────────────────────
    // RESEARCH_DONE
    // ─────────────────────────────────────────────────────────────────────────
    public static void processResearchDone(List<AI_Navigator_Inbound__e> events) {
        Map<Id, AI_Navigator_Inbound__e> sfIdToEvent = new Map<Id, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> azureIdToEvent = new Map<String, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = new Map<String, AI_Navigator_Inbound__e>();

        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String sfId = (String) payload.get('salesforceId');
            String azId = (String) payload.get('companyId');
            String corrId = String.isNotBlank((String) payload.get('correlationId')) 
                ? (String) payload.get('correlationId') 
                : evt.Correlation_Id__c;

            if (String.isNotBlank(sfId)) {
                try { sfIdToEvent.put((Id) sfId.trim(), evt); } catch (Exception e) {}
            }
            if (String.isNotBlank(azId)) {
                azureIdToEvent.put(azId.trim(), evt);
            }
            if (String.isNotBlank(corrId)) {
                corrIdToEvent.put(corrId.trim(), evt);
            }
        }

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        Set<Id> updatedIds = new Set<Id>();

        for (AI_Navigator_Company__c company : [
            SELECT Id, Status__c, Research_Completed_At__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Id IN :sfIdToEvent.keySet()
               OR  Azure_Company_Id__c IN :azureIdToEvent.keySet()
               OR  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            if (updatedIds.contains(company.Id)) continue;

            AI_Navigator_Inbound__e evt = sfIdToEvent.containsKey(company.Id) 
                ? sfIdToEvent.get(company.Id)
                : (String.isNotBlank(company.Azure_Company_Id__c) && azureIdToEvent.containsKey(company.Azure_Company_Id__c))
                    ? azureIdToEvent.get(company.Azure_Company_Id__c)
                    : corrIdToEvent.get(company.Correlation_Id__c);

            if (evt == null) continue;

            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String status = (String) payload.get('status');
            String azId = (String) payload.get('companyId');

            if (status == 'failed') {
                company.Status__c        = 'failed';
                company.Error_Message__c = extractErrorMessage(payload);
            } else {
                company.Status__c                = 'completed';
                company.Research_Completed_At__c = DateTime.now();
                company.Error_Message__c         = null;
            }

            if (String.isNotBlank(azId)) {
                company.Azure_Company_Id__c = azId.trim();
            }

            toUpdate.add(company);
            updatedIds.add(company.Id);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processResearchDone');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCORING_DONE
    // ─────────────────────────────────────────────────────────────────────────
    public static void processScoringDone(List<AI_Navigator_Inbound__e> events) {
        Map<Id, AI_Navigator_Inbound__e> sfIdToEvent = new Map<Id, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> azureIdToEvent = new Map<String, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = new Map<String, AI_Navigator_Inbound__e>();

        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String sfId = (String) payload.get('salesforceId');
            String azId = (String) payload.get('companyId');
            String corrId = String.isNotBlank((String) payload.get('correlationId')) 
                ? (String) payload.get('correlationId') 
                : evt.Correlation_Id__c;

            if (String.isNotBlank(sfId)) {
                try { sfIdToEvent.put((Id) sfId.trim(), evt); } catch (Exception e) {}
            }
            if (String.isNotBlank(azId)) {
                azureIdToEvent.put(azId.trim(), evt);
            }
            if (String.isNotBlank(corrId)) {
                corrIdToEvent.put(corrId.trim(), evt);
            }
        }

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        Set<Id> updatedIds = new Set<Id>();

        for (AI_Navigator_Company__c company : [
            SELECT Id, Prospect_Score__c, Scored_At__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Id IN :sfIdToEvent.keySet()
               OR  Azure_Company_Id__c IN :azureIdToEvent.keySet()
               OR  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            if (updatedIds.contains(company.Id)) continue;

            AI_Navigator_Inbound__e evt = sfIdToEvent.containsKey(company.Id) 
                ? sfIdToEvent.get(company.Id)
                : (String.isNotBlank(company.Azure_Company_Id__c) && azureIdToEvent.containsKey(company.Azure_Company_Id__c))
                    ? azureIdToEvent.get(company.Azure_Company_Id__c)
                    : corrIdToEvent.get(company.Correlation_Id__c);

            if (evt == null) continue;

            Map<String, Object> payload = parsePayload(evt.Payload__c);
            Object scoreVal = payload.get('overallScore');
            String azId = (String) payload.get('companyId');

            if (scoreVal != null) {
                company.Prospect_Score__c = Decimal.valueOf(String.valueOf(scoreVal));
                company.Scored_At__c      = DateTime.now();
                company.Error_Message__c  = null;
            } else {
                company.Error_Message__c = extractErrorMessage(payload);
            }

            if (String.isNotBlank(azId)) {
                company.Azure_Company_Id__c = azId.trim();
            }

            toUpdate.add(company);
            updatedIds.add(company.Id);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processScoringDone');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REPORT_READY
    // ─────────────────────────────────────────────────────────────────────────
    public static void processReportReady(List<AI_Navigator_Inbound__e> events) {
        Map<Id, AI_Navigator_Inbound__e> sfIdToEvent = new Map<Id, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> azureIdToEvent = new Map<String, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = new Map<String, AI_Navigator_Inbound__e>();

        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String sfId = (String) payload.get('salesforceId');
            String azId = (String) payload.get('companyId');
            String corrId = String.isNotBlank((String) payload.get('correlationId')) 
                ? (String) payload.get('correlationId') 
                : evt.Correlation_Id__c;

            if (String.isNotBlank(sfId)) {
                try { sfIdToEvent.put((Id) sfId.trim(), evt); } catch (Exception e) {}
            }
            if (String.isNotBlank(azId)) {
                azureIdToEvent.put(azId.trim(), evt);
            }
            if (String.isNotBlank(corrId)) {
                corrIdToEvent.put(corrId.trim(), evt);
            }
        }

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        Set<Id> updatedIds = new Set<Id>();

        for (AI_Navigator_Company__c company : [
            SELECT Id, Status__c, PDF_Report_URL__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Id IN :sfIdToEvent.keySet()
               OR  Azure_Company_Id__c IN :azureIdToEvent.keySet()
               OR  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            if (updatedIds.contains(company.Id)) continue;

            AI_Navigator_Inbound__e evt = sfIdToEvent.containsKey(company.Id) 
                ? sfIdToEvent.get(company.Id)
                : (String.isNotBlank(company.Azure_Company_Id__c) && azureIdToEvent.containsKey(company.Azure_Company_Id__c))
                    ? azureIdToEvent.get(company.Azure_Company_Id__c)
                    : corrIdToEvent.get(company.Correlation_Id__c);

            if (evt == null) continue;

            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String code = (String) payload.get('code');
            String azId = (String) payload.get('companyId');

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

            if (String.isNotBlank(azId)) {
                company.Azure_Company_Id__c = azId.trim();
            }

            toUpdate.add(company);
            updatedIds.add(company.Id);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processReportReady');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROCESSING_ERROR
    // ─────────────────────────────────────────────────────────────────────────
    public static void processError(List<AI_Navigator_Inbound__e> events) {
        Map<Id, AI_Navigator_Inbound__e> sfIdToEvent = new Map<Id, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> azureIdToEvent = new Map<String, AI_Navigator_Inbound__e>();
        Map<String, AI_Navigator_Inbound__e> corrIdToEvent = new Map<String, AI_Navigator_Inbound__e>();

        for (AI_Navigator_Inbound__e evt : events) {
            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String sfId = (String) payload.get('salesforceId');
            String azId = (String) payload.get('companyId');
            String corrId = String.isNotBlank((String) payload.get('correlationId')) 
                ? (String) payload.get('correlationId') 
                : evt.Correlation_Id__c;

            if (String.isNotBlank(sfId)) {
                try { sfIdToEvent.put((Id) sfId.trim(), evt); } catch (Exception e) {}
            }
            if (String.isNotBlank(azId)) {
                azureIdToEvent.put(azId.trim(), evt);
            }
            if (String.isNotBlank(corrId)) {
                corrIdToEvent.put(corrId.trim(), evt);
            }
        }

        List<AI_Navigator_Company__c> toUpdate = new List<AI_Navigator_Company__c>();
        Set<Id> updatedIds = new Set<Id>();

        for (AI_Navigator_Company__c company : [
            SELECT Id, Status__c,
                   Correlation_Id__c, Azure_Company_Id__c, Error_Message__c
            FROM   AI_Navigator_Company__c
            WHERE  Id IN :sfIdToEvent.keySet()
               OR  Azure_Company_Id__c IN :azureIdToEvent.keySet()
               OR  Correlation_Id__c IN :corrIdToEvent.keySet()
        ]) {
            if (updatedIds.contains(company.Id)) continue;

            AI_Navigator_Inbound__e evt = sfIdToEvent.containsKey(company.Id) 
                ? sfIdToEvent.get(company.Id)
                : (String.isNotBlank(company.Azure_Company_Id__c) && azureIdToEvent.containsKey(company.Azure_Company_Id__c))
                    ? azureIdToEvent.get(company.Azure_Company_Id__c)
                    : corrIdToEvent.get(company.Correlation_Id__c);

            if (evt == null) continue;

            Map<String, Object> payload = parsePayload(evt.Payload__c);
            String azId = (String) payload.get('companyId');

            company.Status__c        = 'failed';
            company.Error_Message__c = extractErrorMessage(payload);

            if (String.isNotBlank(azId)) {
                company.Azure_Company_Id__c = azId.trim();
            }

            toUpdate.add(company);
            updatedIds.add(company.Id);
        }
        updateRecords(toUpdate, 'CompanyStatusUpdater.processError');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────────────────────────────────
    private static String extractErrorMessage(Map<String, Object> payload) {
        String msg  = (String) payload.get('message');
        String code = (String) payload.get('code');
        String raw  = String.isNotBlank(msg) ? msg
                    : String.isNotBlank(code) ? code
                    : 'Azure processing error — no details provided';
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
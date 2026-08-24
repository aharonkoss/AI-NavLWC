/**
 * AI_Navigator_Inbound_Handler
 *
 * Routes inbound Platform Events from Azure to the correct
 * processor based on Event_Type__c. All DML is bulkified —
 * the trigger may fire with multiple events at once.
 *
 * Supported Event Types:
 *   RESEARCH_DONE      → CompanyStatusUpdater
 *   UPLOAD_PROCESSED   → SubmissionProgressUpdater
 *   BATCH_PROGRESS     → SubmissionProgressUpdater
 *   SIGNAL_ALERT       → SignalAlertProcessor
 *   SCORING_DONE       → CompanyStatusUpdater
 *   REPORT_READY       → CompanyStatusUpdater
 *   PROCESSING_ERROR   → CompanyStatusUpdater
 */
public without sharing class AI_Navigator_Inbound_Handler {

    // ── Entry Point ──────────────────────────────────────────────────────────
    public static void handle(List<AI_Navigator_Inbound__e> events) {

        // Partition events by type for bulkified processing
        List<AI_Navigator_Inbound__e> researchEvents    = new List<AI_Navigator_Inbound__e>();
        List<AI_Navigator_Inbound__e> uploadEvents      = new List<AI_Navigator_Inbound__e>();
        List<AI_Navigator_Inbound__e> progressEvents    = new List<AI_Navigator_Inbound__e>();
        List<AI_Navigator_Inbound__e> signalEvents      = new List<AI_Navigator_Inbound__e>();
        List<AI_Navigator_Inbound__e> scoringEvents     = new List<AI_Navigator_Inbound__e>();
        List<AI_Navigator_Inbound__e> reportEvents      = new List<AI_Navigator_Inbound__e>();
        List<AI_Navigator_Inbound__e> errorEvents       = new List<AI_Navigator_Inbound__e>();

        for (AI_Navigator_Inbound__e evt : events) {

            // Log every inbound event to the request log
            logEvent(evt);

            if (String.isBlank(evt.Event_Type__c)) {
                System.debug(LoggingLevel.WARN,
                    'AI_Navigator_Inbound_Handler: Received event with no Event_Type__c. ' +
                    'Message_Id: ' + evt.Message_Id__c);
                continue;
            }

            switch on evt.Event_Type__c {
                when 'RESEARCH_DONE'    { researchEvents.add(evt); }
                when 'UPLOAD_PROCESSED' { uploadEvents.add(evt); }
                when 'BATCH_PROGRESS'   { progressEvents.add(evt); }
                when 'SIGNAL_ALERT'     { signalEvents.add(evt); }
                when 'SCORING_DONE'     { scoringEvents.add(evt); }
                when 'REPORT_READY'     { reportEvents.add(evt); }
                when 'PROCESSING_ERROR' { errorEvents.add(evt); }
                when else {
                    System.debug(LoggingLevel.WARN,
                        'AI_Navigator_Inbound_Handler: Unknown Event_Type__c: ' +
                        evt.Event_Type__c + ' | Message_Id: ' + evt.Message_Id__c);
                }
            }
        }

        // ── Dispatch to processors ───────────────────────────────────────────
        if (!researchEvents.isEmpty()) {
            CompanyStatusUpdater.processResearchDone(researchEvents);
        }
        if (!uploadEvents.isEmpty()) {
            SubmissionProgressUpdater.processUploadComplete(uploadEvents);
        }
        if (!progressEvents.isEmpty()) {
            SubmissionProgressUpdater.processBatchProgress(progressEvents);
        }
        if (!signalEvents.isEmpty()) {
            SignalAlertProcessor.processSignalAlerts(signalEvents);
        }
        if (!scoringEvents.isEmpty()) {
            CompanyStatusUpdater.processScoringDone(scoringEvents);
        }
        if (!reportEvents.isEmpty()) {
            CompanyStatusUpdater.processReportReady(reportEvents);
        }
        if (!errorEvents.isEmpty()) {
            CompanyStatusUpdater.processError(errorEvents);
        }
    }

    // ── Private: log every event to AI_Navigator_Request_Log__c ────────────────────
    private static void logEvent(AI_Navigator_Inbound__e evt) {
        try {
            AI_Navigator_Request_Log__c log = new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = 'PLATFORM_EVENT',
                Endpoint_Name__c    = 'AI_Navigator_Inbound__e',
                Request_Body__c     = evt.Payload__c,
                Status__c           = evt.Status_Code__c,
                Correlation_ID__c   = evt.Correlation_Id__c,
                Error_Message__c    = evt.Event_Type__c + ' | ' + evt.Schema_Name__c
            );
            insert log;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                'AI_Navigator_Inbound_Handler: Failed to write log. ' + de.getMessage());
        }
    }
}
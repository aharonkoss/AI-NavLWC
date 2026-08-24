/**
 * AI_Navigator_Outbound_Handler
 *
 * Routes outbound platform events to the correct Azure HTTP callout
 * based on EventType__c. Runs as a Queueable to allow HTTP callouts
 * from a Platform Event trigger context.
 */
public with sharing class AI_Navigator_Outbound_Handler {

    public static void handle(List<AI_Navigator_Outbound__e> events) {
        for (AI_Navigator_Outbound__e evt : events) {
            if (evt.Event_Type__c == 'UPLOAD') {
                System.enqueueJob(new UploadCalloutJob(evt.Payload__c, evt.Correlation_ID__c));
            }
            // Future event types (RESEARCH_REQUEST, etc.) get else-if branches here
        }
    }

    // ── Queueable: makes the actual HTTP callout to Azure ──────────────────
    public class UploadCalloutJob implements Queueable, Database.AllowsCallouts {

        private String payload;
        private String correlationId;

        public UploadCalloutJob(String payload, String correlationId) {
            this.payload     = payload;
            this.correlationId = correlationId;
        }

        public void execute(QueueableContext ctx) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Azure_AI_Navigator/api/v1/upload');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('X-Correlation-Id', correlationId);
            req.setBody(payload);
            req.setTimeout(120000); // 2 minutes

            HttpResponse res = new Http().send(req);

            writeLog(res, correlationId);
        }

        private void writeLog(HttpResponse res, String corrId) {
            String status  = (res.getStatusCode() >= 200 && res.getStatusCode() < 300) ? 'Success' : 'Failed';
            try {
                insert new AI_Navigator_Request_Log__c(
                    HTTP_Method__c      = 'POST',
                    Endpoint_Name__c    = 'AI_Navigator_Outbound_Handler.UploadCalloutJob',
                    Response_Body__c    = res.getBody(),
                    Status__c           = status,
                    HTTP_Status_Code__c = res.getStatusCode(),
                    Correlation_ID__c   = corrId,
                    Error_Message__c    = status == 'Failed' ? 'Azure returned: ' + res.getStatus() : null
                );
            } catch (Exception e) {
                System.debug(LoggingLevel.ERROR, 'writeLog failed: ' + e.getMessage());
            }
        }
    }
}
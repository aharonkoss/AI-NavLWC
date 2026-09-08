/**
 * AzureUploadCompanyCallout
 * Queueable + AllowsCallouts — fires the HTTP POST to Azure after
 * UploadController creates the Submission__c and Company__c records.
 *
 * Request body matches UploadRequest.v1 schema:
 * { fileName, fileContent, submissionId, companies[], stage, clientType,
 *   fileSize, submittedBy, submittedAt, correlationId, schemaVersion }
 * correlationId is ALSO sent as header X-Correlation-Id via AzureHttpService.
 */
public class AzureUploadCompanyCallout implements Queueable, Database.AllowsCallouts {

    private String submissionRecordId;
    private String payload;
    private String correlationId;

    public AzureUploadCompanyCallout(
        String submissionRecordId,
        String payload,
        String correlationId
    ) {
        this.submissionRecordId = submissionRecordId;
        this.payload            = payload;
        this.correlationId      = correlationId;
    }

    public void execute(QueueableContext context) {
        try {
            HttpRequest req = AzureHttpService.buildRequest(
                'POST',
                '/v1/upload',              // ← confirm with Azure team
                correlationId,
                UserInfo.getUserId()
            );
            req.setTimeout(120000);        // ← override default — fileContent is large
            req.setBody(payload);

            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() == 200 || res.getStatusCode() == 202) {
                update new AI_Navigator_Submission__c(
                    Id        = submissionRecordId,
                    Status__c = 'submitted'
                );
            } else {
                update new AI_Navigator_Submission__c(
                    Id        = submissionRecordId,
                    Status__c = 'failed'
                );
                System.debug(LoggingLevel.ERROR,
                    'AzureUploadCompanyCallout failed ['
                    + res.getStatusCode() + ']: '
                    + AzureHttpService.parseErrorResponse(res));
            }

        } catch (Exception ex) {
            System.debug(LoggingLevel.ERROR,
                'AzureUploadCompanyCallout Exception: ' + ex.getMessage() + ' | ' + ex.getStackTraceString());
            logException(ex);
        }
    }

    // ── Private: log only when an exception occurs ───────────────────────────
    private void logException(Exception ex) {
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = 'POST',
                Endpoint_Name__c    = 'AzureUploadCompanyCallout',
                Response_Body__c    = ex.getStackTraceString(),
                Status__c           = 'Failed',
                Correlation_ID__c   = correlationId,
                Error_Message__c    = ('submissionId=' + submissionRecordId + ' | ' + ex.getMessage()).left(32768)
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
        }
    }
}
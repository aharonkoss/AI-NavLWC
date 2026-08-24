/**
 * AzureManualCompanyCallout
 * Queueable + AllowsCallouts — fires the HTTP POST to Azure after 
 * InputController creates the AI_Navigator_Company__c record synchronously.
 *
 * Request body matches Postman exactly:
 * { name, website, city, state, stage, clientType, salesforceId }
 * correlationId is a HEADER only (X-Correlation-Id) — not in body.
 */
public class AzureManualCompanyCallout implements Queueable, Database.AllowsCallouts {

    private String recordId;
    private String companyName;
    private String website;
    private String city;
    private String state;
    private String stage;
    private String clientType;
    private String salesforceId;

    public AzureManualCompanyCallout(
        String recordId,
        String companyName,
        String website,
        String city,
        String state,
        String stage,
        String clientType,
        String salesforceId
    ) {
        this.recordId    = recordId;
        this.companyName = companyName;
        this.website     = website;
        this.city        = city;
        this.state       = state;
        this.stage       = stage;
        this.clientType  = clientType;
        this.salesforceId = salesforceId;
    }
    public void execute(QueueableContext context) {

        String correlationId = AiNavigatorEventService.generateCorrelationId();
        String userId        = UserInfo.getUserId();

        HttpRequest req = AzureHttpService.buildRequest(
            'POST',
            '/v1/user/companies/manual',
            correlationId,
            userId
        );

        Map<String, Object> payload = new Map<String, Object>{
            'name'         => companyName,
            'website'      => website,
            'city'         => city,
            'state'        => state,
            'stage'        => stage,
            'clientType'   => clientType,
            'salesforceId' => salesforceId
        };

        String requestBody = JSON.serialize(payload);
        req.setBody(requestBody);

        HttpResponse res = new Http().send(req);

        // ── LOG THE OUTBOUND REQUEST ──────────────────────────────────────────
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c    = 'POST',
                Endpoint_Name__c  = 'AzureManualCompanyCallout',
                Request_Body__c   = requestBody,          // exactly what we sent
                Response_Body__c  = res.getBody(),        // exactly what Azure returned
                Status__c         = res.getStatusCode() == 201 || res.getStatusCode() == 200
                                        ? 'Success' : 'Failed',
                HTTP_Status_Code__c = res.getStatusCode(),
                Correlation_ID__c = correlationId,
                Error_Message__c  = 'salesforceId=' + salesforceId
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
        }
        // ─────────────────────────────────────────────────────────────────────

        if (res.getStatusCode() == 201 || res.getStatusCode() == 200) {
            Map<String, Object> responseBody =
                (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            String azureCompanyId = (String) responseBody.get('companyId');

            update new AI_Navigator_Company__c(
                Id                  = recordId,
                Azure_Company_Id__c = azureCompanyId,
                Correlation_Id__c   = correlationId,
                Status__c           = 'processing'
            );
        } else {
            update new AI_Navigator_Company__c(
                Id        = recordId,
                Status__c = 'failed'
            );
            System.debug(LoggingLevel.ERROR,
                'AzureManualCompanyCallout failed [' + res.getStatusCode() + ']: ' + res.getBody());
        }
    }

}
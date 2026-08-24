/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-07-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class AzureRestServices_Test {

    private static RestRequest buildMockRequest(String body, String corrId) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/ainavigator/v1/companies/callback';
        req.httpMethod = 'POST';
        req.headers.put('Content-Type', 'application/json');
        req.headers.put('X-Correlation-Id', corrId);
        req.requestBody = Blob.valueOf(body);
        return req;
    }

    @isTest
    static void testEchoServiceSuccess() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/ainavigator/v1/echo';
        req.httpMethod = 'POST';
        req.headers.put('Content-Type', 'application/json');
        req.headers.put('X-Correlation-ID', 'corr-echo-111');
        req.requestBody = Blob.valueOf('{"test":"echo"}');

        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        AzureEchoService.handlePost();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode);
        List<AI_Navigator_Request_Log__c> logs = [SELECT Id FROM AI_Navigator_Request_Log__c];
        System.assert(logs.size() > 0);
    }

    @isTest
    static void testInboundEventServiceSuccess() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/ainavigator/v1/events/inbound';
        req.httpMethod = 'POST';
        req.headers.put('Content-Type', 'application/json');
        req.headers.put('X-Correlation-Id', 'corr-inbound-111');
        req.requestBody = Blob.valueOf('{"Event_Type__c":"RESEARCH_DONE","Msg_Type__c":"Response","Status_Code__c":"200","Schema_Name__c":"Research","Payload__c":"{}","Message_Id__c":"msg-111"}');

        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        AzureInboundEventService.handlePost();
        Test.stopTest();

        System.assertEquals(202, RestContext.response.statusCode);
    }

    @isTest
    static void testAzureCompanyCallbackServiceSuccess() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Callback Comp', 'pending');
        comp = [SELECT Id FROM AI_Navigator_Company__c WHERE Id = :comp.Id];

        String body = '{"companyId":"' + comp.Id + '","status":"completed","prospectScore":92.5,"pdfReportUrl":"https://azure.com/report.pdf"}';
        RestContext.request = buildMockRequest(body, 'corr-callback-111');
        RestContext.response = new RestResponse();

        Test.startTest();
        AzureCompanyCallbackService.handlePost();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode);
        AI_Navigator_Company__c updated = [SELECT Status__c, Prospect_Score__c, PDF_Report_URL__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals('completed', updated.Status__c);
        System.assertEquals(92.5, updated.Prospect_Score__c);
        System.assertEquals('https://azure.com/report.pdf', updated.PDF_Report_URL__c);
    }
    
    // ── Additional AzureEchoService Error Tests ─────────────────────────────
    
    @isTest
    static void testEchoServicePayloadTooLarge() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/ainavigator/v1/echo';
        req.httpMethod = 'POST';
        req.headers.put('Content-Type', 'application/json');
        req.headers.put('X-Correlation-ID', 'corr-echo-large');
        
        // FIXED: Use 3-byte Euro characters to exceed 32KB binary size while keeping 
        // the character length well under the 32k database string limit to prevent STRING_TOO_LONG
        String bodyString = '{"data":"' + '€'.repeat(11000) + '"}';
        req.requestBody = Blob.valueOf(bodyString);

        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        AzureEchoService.handlePost();
        Test.stopTest();

        System.assertEquals(413, RestContext.response.statusCode);
    }

    @isTest
    static void testEchoServiceUnsupportedMediaType() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/ainavigator/v1/echo';
        req.httpMethod = 'POST';
        req.headers.put('Content-Type', 'text/html'); // Invalid Media Type
        req.headers.put('X-Correlation-ID', 'corr-echo-unsupported');
        req.requestBody = Blob.valueOf('{"test":"value"}');

        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        AzureEchoService.handlePost();
        Test.stopTest();

        System.assertEquals(415, RestContext.response.statusCode);
    }

    @isTest
    static void testEchoServiceInvalidJson() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/ainavigator/v1/echo';
        req.httpMethod = 'POST';
        req.headers.put('Content-Type', 'application/json');
        req.headers.put('X-Correlation-ID', 'corr-echo-badjson');
        req.requestBody = Blob.valueOf('{malformed json string}'); // Malformed JSON

        RestContext.request = req;
        RestContext.response = new RestResponse();

        Test.startTest();
        AzureEchoService.handlePost();
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode);
    }
}
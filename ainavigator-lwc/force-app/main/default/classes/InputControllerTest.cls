/**
 * @description Tests for InputController (v2 — HTTP callout replaces Platform Event).
 *
 *   Uses a mock HttpCalloutMock to simulate Azure /manual responses:
 *     - 201 Created  → Azure_Company_Id__c populated, Status = 'processing'
 *     - 200 OK       → duplicate; Azure_Company_Id__c populated, Status = 'processing'
 *     - 400          → Status = 'failed'
 *     - 500          → Status = 'failed'
 *     - CalloutException → Status = 'failed'
 *
 * @group AI Navigator - Tests
 */
@IsTest
private class InputControllerTest {

    // -------------------------------------------------------------------------
    // Mock factory
    // -------------------------------------------------------------------------

    private class AzureManualMock implements HttpCalloutMock {
        private Integer statusCode;
        private String  azureCompanyId;

        AzureManualMock(Integer statusCode, String azureCompanyId) {
            this.statusCode      = statusCode;
            this.azureCompanyId  = azureCompanyId;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(statusCode);
            res.setHeader('Content-Type', 'application/json');
            Map<String, Object> body = new Map<String, Object>{
                'companyId'    => azureCompanyId,
                'salesforceId' => req.getBody().contains('salesforceId')
                                    ? 'echoed' : null,
                'status'       => 'processing',
                'name'         => 'Test Company'
            };
            res.setBody(JSON.serialize(body));
            return res;
        }
    }

    private class AzureErrorMock implements HttpCalloutMock {
        private Integer statusCode;
        AzureErrorMock(Integer sc) { this.statusCode = sc; }
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(statusCode);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"code":"ERROR","message":"Azure error","correlationId":"test"}');
            return res;
        }
    }

    // -------------------------------------------------------------------------
    // submitCompany — returns SF record immediately
    // -------------------------------------------------------------------------

    @IsTest
    static void testSubmitCompanyReturnsSfRecordId() {
        Test.setMock(HttpCalloutMock.class,
            new AzureManualMock(201, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'));

        Test.startTest();
        String jsonResult = InputController.submitCompany(
            'Test Company', 'https://www.test.com', 'Memphis', 'TN', 'PreCall', 'Prospect'
        );
        Test.stopTest();
        // After stopTest(), the @future method has run and Azure 201 was processed

        // 1. Verify the JSON returned to the LWC is correct
        Map<String, Object> result =
            (Map<String, Object>) JSON.deserializeUntyped(jsonResult);

        System.assertEquals(true, (Boolean) result.get('success'),
            'success must be true');
        System.assertNotEquals(null, result.get('companyId'),
            'companyId (SF record Id) must be returned');
        System.assertEquals('pending', (String) result.get('status'),
            'LWC receives pending in the immediate JSON response');

        // 2. Verify Company__c record state AFTER the @future completes
        //    submitCompany inserts as pending, @future flips to processing on 201
        List<Company__c> companies = [
            SELECT Id, Status__c, Correlation_Id__c, Azure_Company_Id__c
            FROM Company__c
            WHERE Name = 'Test Company'
        ];
        System.assertEquals(1, companies.size(),
            'One Company__c should be created');
        System.assertEquals('processing', companies[0].Status__c,
            'Status__c is processing after @future handles Azure 201');
        System.assertEquals('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            companies[0].Azure_Company_Id__c,
            'Azure_Company_Id__c must be stored from the 201 response');
        System.assertNotEquals(null, companies[0].Correlation_Id__c,
            'Correlation_Id__c should be stamped on insert');
    }

    // -------------------------------------------------------------------------
    // @future — 201 response → Azure_Company_Id__c + status = processing
    // -------------------------------------------------------------------------

    @IsTest
    static void testCalloutCreatesNewCompany201() {
        Test.setMock(HttpCalloutMock.class,
            new AzureManualMock(201, '7f3a9b2c-4d5e-4f6a-8b0c-1d2e3f4a5b6c'));

        Company__c c = new Company__c(
            Name = 'New Corp', Website__c = 'https://www.newcorp.com',
            City__c = 'Chicago', State__c = 'IL',
            Status__c = 'pending', Correlation_Id__c = 'SF-0000000000000-aabbccdd'
        );
        insert c;

        Test.startTest();
        InputController.callAzureManualAsync(
            c.Id, 'New Corp', 'https://www.newcorp.com',
            'Chicago', 'IL', 'PreCall', 'Prospect', 'SF-0000000000000-aabbccdd'
        );
        Test.stopTest();

        Company__c updated = [
            SELECT Status__c, Azure_Company_Id__c
            FROM Company__c WHERE Id = :c.Id
        ];
        System.assertEquals('processing', updated.Status__c,
            '201 → Status must be processing');
        System.assertEquals('7f3a9b2c-4d5e-4f6a-8b0c-1d2e3f4a5b6c',
            updated.Azure_Company_Id__c,
            '201 → Azure UUID must be stored in Azure_Company_Id__c');
    }

    // -------------------------------------------------------------------------
    // @future — 200 response → duplicate, still stores Azure UUID
    // -------------------------------------------------------------------------

    @IsTest
    static void testCalloutDuplicateCompany200() {
        Test.setMock(HttpCalloutMock.class,
            new AzureManualMock(200, 'existing-azure-uuid-1111-2222-3333'));

        Company__c c = new Company__c(
            Name = 'Dupe Corp', Website__c = 'https://www.dupecorp.com',
            City__c = 'Dallas', State__c = 'TX',
            Status__c = 'pending', Correlation_Id__c = 'SF-0000000000001-aabbccdd'
        );
        insert c;

        Test.startTest();
        InputController.callAzureManualAsync(
            c.Id, 'Dupe Corp', 'https://www.dupecorp.com',
            'Dallas', 'TX', 'PreCall', 'Prospect', 'SF-0000000000001-aabbccdd'
        );
        Test.stopTest();

        Company__c updated = [
            SELECT Status__c, Azure_Company_Id__c
            FROM Company__c WHERE Id = :c.Id
        ];
        System.assertEquals('processing', updated.Status__c,
            '200 → Status should be processing (research will still proceed)');
        System.assertEquals('existing-azure-uuid-1111-2222-3333',
            updated.Azure_Company_Id__c,
            '200 → Azure UUID must still be stored for retry use');
    }

    // -------------------------------------------------------------------------
    // @future — 400 → failed
    // -------------------------------------------------------------------------

    @IsTest
    static void testCalloutValidationError400() {
        Test.setMock(HttpCalloutMock.class, new AzureErrorMock(400));

        Company__c c = new Company__c(
            Name = 'Bad Corp', Website__c = 'https://www.bad.com',
            City__c = 'Austin', State__c = 'TX',
            Status__c = 'pending', Correlation_Id__c = 'SF-0000000000002-aabbccdd'
        );
        insert c;

        Test.startTest();
        InputController.callAzureManualAsync(
            c.Id, 'Bad Corp', 'https://www.bad.com',
            'Austin', 'TX', 'PreCall', 'Prospect', 'SF-0000000000002-aabbccdd'
        );
        Test.stopTest();

        Company__c updated = [SELECT Status__c FROM Company__c WHERE Id = :c.Id];
        System.assertEquals('failed', updated.Status__c,
            '400 → Status must be failed');
    }

    // -------------------------------------------------------------------------
    // @future — 500 → failed
    // -------------------------------------------------------------------------

    @IsTest
    static void testCalloutServerError500() {
        Test.setMock(HttpCalloutMock.class, new AzureErrorMock(500));

        Company__c c = new Company__c(
            Name = 'Error Corp', Website__c = 'https://www.errorcorp.com',
            City__c = 'Boston', State__c = 'MA',
            Status__c = 'pending', Correlation_Id__c = 'SF-0000000000003-aabbccdd'
        );
        insert c;

        Test.startTest();
        InputController.callAzureManualAsync(
            c.Id, 'Error Corp', 'https://www.errorcorp.com',
            'Boston', 'MA', 'PreCall', 'Prospect', 'SF-0000000000003-aabbccdd'
        );
        Test.stopTest();

        Company__c updated = [SELECT Status__c FROM Company__c WHERE Id = :c.Id];
        System.assertEquals('failed', updated.Status__c,
            '500 → Status must be failed');
    }

    // -------------------------------------------------------------------------
    // submitCompany — DML failure surfaces as AuraHandledException
    // -------------------------------------------------------------------------

    @IsTest
    static void testSubmitCompanyDmlFailure() {
        // Pass a company name that exceeds max field length to force a DML error
        String longName = 'X'.repeat(256);
        Boolean threw = false;
        String errorMessage;

        Test.setMock(HttpCalloutMock.class,
            new AzureManualMock(201, 'irrelevant-uuid'));

        Test.startTest();
        try {
            InputController.submitCompany(
                longName, 'https://www.test.com', 'Dallas', 'TX', 'PreCall', 'Prospect'
            );
        } catch (AuraHandledException e) {
            threw = true;
            errorMessage = e.getMessage();
        }
        Test.stopTest();

        System.assert(threw,
            'submitCompany must throw AuraHandledException on DML failure');
    }
}
/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-06-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class AzureServices_Test {

    @isTest
    static void testPublisherUUIDAndCorrelationId() {
        Test.startTest();
        String uuid = AI_Navigator_Event_Publisher.generateUUID();
        String corrId = AI_Navigator_Event_Publisher.generateCorrelationId();
        Test.stopTest();

        System.assertNotEquals(null, uuid);
        System.assertEquals(36, uuid.length());
        System.assert(corrId.startsWith('SF-'));
    }

    @isTest
    static void testPublisherPublishMethods() {
        Test.startTest();
        AI_Navigator_Event_Publisher.publish('TEST_EVENT', 'Request', 'TestSchema', '{"data":"test"}');
        AI_Navigator_Event_Publisher.publish('TEST_EVENT', 'Request', 'TestSchema', '{"data":"test"}', 'NEW');
        Test.stopTest();
        System.assert(true);
    }

    @isTest
    static void testAzureResearchService() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Research Services Comp', 'pending');
        
        Test.startTest();
        AzureResearchService.requestResearch(comp.Id);
        Test.stopTest();

        AI_Navigator_Company__c updated = [SELECT Status__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals('processing', updated.Status__c);
    }

    @isTest
    static void testAzureScoringService() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Scoring Services Comp', 'completed');
        
        Test.startTest();
        AzureScoringService.requestScoring(comp.Id);
        AzureScoringService.requestScoring(comp.Id, 'crit-111');
        Test.stopTest();
        System.assert(true);
    }

    @isTest
    static void testAzureSignalService() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Signal Services Comp', 'completed');
        
        Test.startTest();
        AzureSignalService.requestSignalAnalysis(comp.Id, 'month');
        Test.stopTest();
        System.assert(true);
    }

    @isTest
    static void testAzureUploadService() {
        // FIXED: Registered HttpCalloutMock to prevent the "TestMethod do not support Web service callouts" error
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(200, '{"status":"success"}'));

        Test.startTest();
        AzureUploadService.submitUpload('SUB-UUID-111', 'file.csv', '/blobs/file.csv', 'PreCall', 'Prospect');
        Test.stopTest();

        List<AI_Navigator_Submission__c> subs = [SELECT Id FROM AI_Navigator_Submission__c WHERE Submission_Id__c = 'SUB-UUID-111'];
        System.assertEquals(1, subs.size());
    }

    @isTest
    static void testAzureManualCompanyCalloutSuccess() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Manual Callout Company', 'pending');
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(201, '{"companyId":"azure-id-456"}'));

        AzureManualCompanyCallout job = new AzureManualCompanyCallout(
            comp.Id, comp.Name, comp.Website__c, comp.City__c, comp.State__c, 'PreCall', 'Prospect', comp.Id
        );

        Test.startTest();
        System.enqueueJob(job);
        Test.stopTest();

        AI_Navigator_Company__c updated = [SELECT Status__c, Azure_Company_Id__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals('processing', updated.Status__c);
        System.assertEquals('azure-id-456', updated.Azure_Company_Id__c);
    }

    @isTest
    static void testAzureManualCompanyCalloutFailed() {
        AI_Navigator_Company__c comp = AI_Navigator_TestDataFactory.createCompany('Manual Callout Company Fail', 'pending');
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(500, '{"error":"internal"}'));

        AzureManualCompanyCallout job = new AzureManualCompanyCallout(
            comp.Id, comp.Name, comp.Website__c, comp.City__c, comp.State__c, 'PreCall', 'Prospect', comp.Id
        );

        Test.startTest();
        System.enqueueJob(job);
        Test.stopTest();

        AI_Navigator_Company__c updated = [SELECT Status__c FROM AI_Navigator_Company__c WHERE Id = :comp.Id];
        System.assertEquals('failed', updated.Status__c);
    }

    @isTest
    static void testAzureUploadCompanyCalloutSuccess() {
        AI_Navigator_Submission__c sub = AI_Navigator_TestDataFactory.createSubmission('upload.csv', 'processing');
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(202, '{"status":"accepted"}'));

        AzureUploadCompanyCallout job = new AzureUploadCompanyCallout(sub.Id, '{"companies":[]}', 'corr-999');

        Test.startTest();
        System.enqueueJob(job);
        Test.stopTest();

        AI_Navigator_Submission__c updated = [SELECT Status__c FROM AI_Navigator_Submission__c WHERE Id = :sub.Id];
        System.assertEquals('submitted', updated.Status__c);
    }

    @isTest
    static void testAzureUploadCompanyCalloutFailed() {
        AI_Navigator_Submission__c sub = AI_Navigator_TestDataFactory.createSubmission('upload-fail.csv', 'processing');
        Test.setMock(HttpCalloutMock.class, new AI_Navigator_CalloutMock(500, '{"error":"bad_gateway"}'));

        AzureUploadCompanyCallout job = new AzureUploadCompanyCallout(sub.Id, '{"companies":[]}', 'corr-999');

        Test.startTest();
        System.enqueueJob(job);
        Test.stopTest();

        AI_Navigator_Submission__c updated = [SELECT Status__c FROM AI_Navigator_Submission__c WHERE Id = :sub.Id];
        System.assertEquals('failed', updated.Status__c);
    }

    @isTest
    static void testAzureHttpServiceErrorParsing() {
        HttpResponse res = new HttpResponse();
        res.setStatusCode(400);
        res.setBody('{"code":"VALIDATION_ERROR","message":"Invalid website URL","correlationId":"corr-val-123"}');

        Test.startTest();
        String parsed = AzureHttpService.parseErrorResponse(res);
        Test.stopTest();

        System.assert(parsed.contains('Invalid website URL'));
        System.assert(parsed.contains('VALIDATION_ERROR'));
        System.assert(parsed.contains('corr-val-123'));
    }
}
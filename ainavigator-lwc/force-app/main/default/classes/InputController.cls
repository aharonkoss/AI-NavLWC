/**
 * @description Controller for the inputForm LWC. Handles single-company manual submission.
 *
 *   Flow (v2):
 *     1. Generate correlation ID
 *     2. Insert Company__c (Status = 'pending') — DML first, before any callout
 *     3. Enqueue @future callout to POST /v1/user/companies/manual
 *     4. Return the SF record ID immediately to the LWC (don't wait for Azure)
 *
 *   The @future method (callAzureManualAsync) handles:
 *     - 201 Created  → store Azure UUID in Azure_Company_Id__c, set Status = 'processing'
 *     - 200 OK       → duplicate (same normalizedUrl already tracked); log it, no status change
 *     - 4xx / 5xx   → set Status = 'failed', log error
 *
 *   Named Credential : AIN_Azure_Subkey
 *   Endpoint         : POST /api/v1/user/companies/manual
 *   Timeout SLA      : 30 s (control-plane write per openapi v2 info.description)
 *
 * @group AI Navigator - LWC Controllers
 * @last-modified 2026-04-26
 */
public with sharing class InputController {

    private static final String ENDPOINT =
        'callout:AIN_Azure_Subkey/api/v1/user/companies/manual';
    private static final Integer TIMEOUT_MS = 30000;

    // -------------------------------------------------------------------------
    // AuraEnabled entry point — called by inputForm.js
    // -------------------------------------------------------------------------

    @AuraEnabled
    public static String submitCompany(
        String companyName,
        String website,
        String city,
        String state,
        String stage,
        String clientType
    ) {
        try {
            // 1. Generate correlation ID (v2 format: SF-{unix-ms}-{8-char-lowercase-hex})
            String correlationId = AiNavigatorEventService.generateCorrelationId();

            // 2. Insert Company__c — DML MUST happen before any callout context
            //    Status starts as 'pending'; the @future method flips it to 'processing'
            //    once Azure acknowledges, or 'failed' if the callout errors.
            Company__c company = new Company__c(
                Name             = companyName,
                Website__c       = website,
                City__c          = city,
                State__c         = state,
                Stage__c         = stage,
                Client_Type__c    = clientType,
                Status__c        = 'pending',
                Correlation_Id__c = correlationId,
                Assigned_User__c  = UserInfo.getUserId()
            );
            insert company;

            // 3. Enqueue async callout — passes primitive types only (future method limitation)
            callAzureManualAsync(
                company.Id,
                companyName,
                website,
                city,
                state,
                stage,
                clientType,
                correlationId
            );

            // 4. Return SF record data immediately — LWC shows 'pending' state
            return JSON.serialize(new Map<String, Object>{
                'success'       => true,
                'companyId'     => company.Id,
                'correlationId' => correlationId,
                'name'          => companyName,
                'website'       => website,
                'city'          => city,
                'state'         => state,
                'stage'         => stage,
                'clientType'    => clientType,
                'status'        => 'pending',
                'createdAt'     => String.valueOf(DateTime.now())
            });

        } catch (DmlException dmlEx) {
            System.debug(LoggingLevel.ERROR,
                'InputController.submitCompany DML error: ' + dmlEx.getMessage());
            throw new AuraHandledException(
                'Could not save the company record. ' + dmlEx.getDmlMessage(0)
            );
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'InputController.submitCompany unexpected error: ' + e.getMessage());
            throw new AuraHandledException('An unexpected error occurred. Please try again.');
        }
    }

    // -------------------------------------------------------------------------
    // @future callout — POST /v1/user/companies/manual
    // -------------------------------------------------------------------------

    /**
     * @description Fires after DML commits. Sends the company to Azure and
     *              updates the Company__c record based on the response.
     *
     *   Response handling per openapi v2 retry-semantics matrix:
     *     201 → new company created; store azureCompanyId, set status = 'processing'
     *     200 → duplicate (deduped by normalizedUrl); log, leave status as 'pending'
     *              (Azure will still run research; RESEARCH_DONE callback will flip status)
     *     400 → validation error on Azure side; set status = 'failed', log
     *     429 → rate limited; set status = 'failed', log (LWC will show error on next load)
     *     500 → Azure bug; set status = 'failed', log correlationId for support
     *     504 → gateway timeout; set status = 'failed'; caller should verify via GET
     *     other → treat as 500
     */
   @TestVisible
    @future(callout=true)
    private static void callAzureManualAsync(
        String sfRecordId,
        String companyName,
        String website,
        String city,
        String state,
        String stage,
        String clientType,
        String correlationId
    ) {
        // Build request body per ManualCompanyInput schema (openapi v2)
        Map<String, Object> body = new Map<String, Object>{
            'name'          => companyName,
            'website'       => website,
            'city'          => city,
            'state'         => state,
            'stage'         => stage,
            'clientType'    => clientType,
            'salesforceId'  => sfRecordId,    // echoed back on every callback for SF-side matching
            'correlationId' => correlationId
        };

        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-Correlation-Id', correlationId);
        req.setTimeout(TIMEOUT_MS);
        req.setBody(JSON.serialize(body));

        String azureCompanyId;
        String newStatus;
        String errorDetail;

        try {
            Http http = new Http();
            HttpResponse res = http.send(req);
            Integer statusCode = res.getStatusCode();

            if (statusCode == 201) {
                // New company created — parse Azure UUID from response body
                Map<String, Object> respBody =
                    (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                azureCompanyId = (String) respBody.get('companyId');
                newStatus = 'processing';
                System.debug(LoggingLevel.INFO,
                    'InputController: Azure created company | sfId=' + sfRecordId +
                    ' | azureId=' + azureCompanyId + ' | correlationId=' + correlationId);

            } else if (statusCode == 200) {
                // Duplicate — company already tracked under this tenant/URL
                // Azure will still run research; RESEARCH_DONE will update status via callback
                Map<String, Object> respBody =
                    (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                azureCompanyId = (String) respBody.get('companyId');
                newStatus = 'processing';   // treat same as new — research will proceed
                System.debug(LoggingLevel.INFO,
                    'InputController: Duplicate company (200) | sfId=' + sfRecordId +
                    ' | azureId=' + azureCompanyId + ' | correlationId=' + correlationId);

            } else {
                // 400, 429, 500, 504 or anything unexpected
                newStatus = 'failed';
                errorDetail = 'Azure HTTP ' + statusCode + ': ' + res.getBody();
                System.debug(LoggingLevel.ERROR,
                    'InputController: Azure callout failed | sfId=' + sfRecordId +
                    ' | status=' + statusCode + ' | correlationId=' + correlationId +
                    ' | body=' + res.getBody());
            }

        } catch (System.CalloutException ce) {
            newStatus = 'failed';
            errorDetail = 'Callout exception: ' + ce.getMessage();
            System.debug(LoggingLevel.ERROR,
                'InputController: Callout exception | sfId=' + sfRecordId +
                ' | correlationId=' + correlationId + ' | error=' + ce.getMessage());
        }

        // Update Company__c with the result
        updateCompanyRecord(sfRecordId, azureCompanyId, newStatus, correlationId);
    }

    // -------------------------------------------------------------------------
    // Helper — update Company__c after callout
    // -------------------------------------------------------------------------

    private static void updateCompanyRecord(
        String sfRecordId,
        String azureCompanyId,
        String newStatus,
        String correlationId
    ) {
        try {
            Company__c c = new Company__c(Id = sfRecordId);
            c.Status__c = newStatus;
            if (String.isNotBlank(azureCompanyId)) {
                c.Azure_Company_Id__c = azureCompanyId;
            }
            update c;
        } catch (DmlException de) {
            // Can't surface to LWC from @future — log for admin investigation
            System.debug(LoggingLevel.ERROR,
                'InputController.updateCompanyRecord DML failed | sfId=' + sfRecordId +
                ' | correlationId=' + correlationId + ' | error=' + de.getMessage());
        }
    }
}
/**
 * AzureCompanyCallbackService
 *
 * Direct HTTP callback endpoint. Azure calls this to update a
 * specific Company__c record with research results, scores, or
 * status changes without going through the Platform Event bus.
 * Used for lightweight updates where full event routing is overkill.
 *
 * Endpoint : /services/apexrest/ainavigator/v1/companies/callback
 * Method   : POST
 * Auth     : OAuth 2.0 Bearer Token (Client Credentials Flow)
 *
 * Expected body:
 * {
 *   "companyId"    : "a0Bxx000001SvgsEAC",   // Salesforce record ID
 *   "status"       : "completed",             // pending/processing/completed/failed
 *   "prospectScore": 78.5,                    // optional
 *   "pdfReportUrl" : "https://...",           // optional
 *   "correlationId": "uuid"                   // optional
 * }
 */
@RestResource(urlMapping='/ainavigator/v1/companies/callback')
global without sharing class AzureCompanyCallbackService {

    private static final String CORR_HEADER = 'X-Correlation-Id';

    @HttpPost
    global static void handlePost() {

        RestRequest  req = RestContext.request;
        RestResponse res = RestContext.response;

        String correlationId = '';
        String requestBody   = '';

        try {
            // ── 1. Headers ───────────────────────────────────────────────────
            correlationId = req.headers.get(CORR_HEADER);
            if (String.isBlank(correlationId)) {
                correlationId = 'NO-CORR-ID-' + DateTime.now().getTime();
            }

            // ── 2. Parse body ────────────────────────────────────────────────
            requestBody = req.requestBody != null ? req.requestBody.toString() : '';
            if (String.isBlank(requestBody)) {
                sendResponse(res, 400, 'error', 'Request body is required.', correlationId);
                return;
            }

            Map<String, Object> body;
            try {
                body = (Map<String, Object>) JSON.deserializeUntyped(requestBody);
            } catch (JSONException je) {
                sendResponse(res, 400, 'error', 'Invalid JSON.', correlationId);
                return;
            }

            // ── 3. Validate companyId ────────────────────────────────────────
            String companyId = (String) body.get('companyId');
            if (String.isBlank(companyId)) {
                sendResponse(res, 400, 'error', 'companyId is required.', correlationId);
                return;
            }

            // ── 4. Fetch company ─────────────────────────────────────────────
            List<AI_Navigator_Company__c> companies = [
                SELECT Id, Status__c, Prospect_Score__c, Scored_At__c,
                       PDF_Report_URL__c, Research_Completed_At__c,
                       Correlation_Id__c
                FROM AI_Navigator_Company__c
                WHERE Id = :companyId
                LIMIT 1
            ];

            if (companies.isEmpty()) {
                sendResponse(res, 404, 'error',
                    'Company not found: ' + companyId, correlationId);
                return;
            }

            AI_Navigator_Company__c company = companies[0];

            // ── 5. Apply updates from payload ────────────────────────────────
            String newStatus = (String) body.get('status');
            if (String.isNotBlank(newStatus)) {
                company.Status__c = newStatus;
                if (newStatus == 'completed' || newStatus == 'failed') {
                    company.Research_Completed_At__c = DateTime.now();
                }
            }

            Object scoreVal = body.get('prospectScore');
            if (scoreVal != null) {
                company.Prospect_Score__c = Decimal.valueOf(String.valueOf(scoreVal));
                company.Scored_At__c      = DateTime.now();
            }

            String pdfUrl = (String) body.get('pdfReportUrl');
            if (String.isNotBlank(pdfUrl)) {
                company.PDF_Report_URL__c = pdfUrl;
            }

            company.Correlation_Id__c = correlationId;

            // ── 6. Save ──────────────────────────────────────────────────────
            try {
                update company;
            } catch (DmlException de) {
                sendResponse(res, 500, 'error',
                    'Failed to update company record.', correlationId);
                return;
            }

            // ── 7. Log and respond ───────────────────────────────────────────
            logRequest(correlationId, companyId, requestBody, 200);

            sendResponse(res, 200, 'success',
                'Company record updated successfully.', correlationId);

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'AzureCompanyCallbackService: ' + e.getTypeName() +
                ': ' + e.getMessage() + ' | Line: ' + e.getLineNumber());
            sendResponse(res, 500, 'error',
                'Internal Server Error. Contact the Salesforce admin.', correlationId);
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────
    private static void sendResponse(
        RestResponse res,
        Integer      statusCode,
        String       status,
        String       message,
        String       correlationId
    ) {
        Map<String, Object> body = new Map<String, Object>{
            'status'        => status,
            'message'       => message,
            'correlationId' => correlationId,
            'timestamp'     => String.valueOf(DateTime.now())
        };
        res.statusCode   = statusCode;
        res.responseBody = Blob.valueOf(JSON.serializePretty(body));
        res.headers.put('Content-Type', 'application/json');
        res.headers.put('X-Correlation-Id', correlationId);
    }

    private static void logRequest(
        String correlationId,
        String companyId,
        String requestBody,
        Integer statusCode
    ) {
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = 'POST',
                Endpoint_Name__c    = 'AzureCompanyCallbackService',
                Request_Body__c     = requestBody,
                Status__c           = statusCode == 200 ? 'Success' : 'Error',
                HTTP_Status_Code__c = statusCode,
                Correlation_ID__c   = correlationId,
                Error_Message__c    = 'CompanyId: ' + companyId
            );
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                'AzureCompanyCallbackService: Log failed. ' + de.getMessage());
        }
    }
}
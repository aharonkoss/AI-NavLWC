/**
 * AzureEchoService
 *
 * Secure Apex REST endpoint for testing Azure → Salesforce connectivity.
 * Accepts any JSON POST body and returns it verbatim.
 * Logs every request (success and failure) to AI_Navigator_Request_Log__c.
 *
 * Endpoint : /services/apexrest/ainavigator/v1/echo
 * Method   : POST
 * Auth     : OAuth 2.0 Bearer Token (Client Credentials Flow)
 */
@RestResource(urlMapping='/ainavigator/v1/echo')
global with sharing class AzureEchoService {


    // ── Constants ────────────────────────────────────────────────────────────
    private static final String  ENDPOINT_NAME     = 'AzureEchoService';
    private static final Integer MAX_BODY_BYTES     = 32768;   // 32 KB hard limit
    private static final String  CORR_HEADER        = 'X-Correlation-ID';
    private static final String  CONTENT_TYPE_HDR   = 'Content-Type';


    // ── Entry Point ──────────────────────────────────────────────────────────
    @HttpPost
    global static void handlePost() {

        RestRequest  req = RestContext.request;
        RestResponse res = RestContext.response;

        String  correlationId = '';
        String  requestBody   = '';
        String  sourceIp      = '';
        Integer bodyBytes     = 0;

        try {
            // ── 1. Extract metadata ──────────────────────────────────────────
            correlationId = req.headers.get(CORR_HEADER);
            if (String.isBlank(correlationId)) {
                correlationId = 'NO-CORR-ID-' + String.valueOf(DateTime.now().getTime());
            }

            sourceIp    = req.remoteAddress;
            requestBody = req.requestBody != null ? req.requestBody.toString() : '';
            bodyBytes   = req.requestBody != null ? req.requestBody.size() : 0;

            // ── 2. Validate Content-Type ─────────────────────────────────────
            String contentType = req.headers.get(CONTENT_TYPE_HDR);
            if (contentType == null || !contentType.containsIgnoreCase('application/json')) {
                sendError(res, 415, 'Unsupported Media Type. Content-Type must be application/json.',
                          correlationId, requestBody, sourceIp, bodyBytes);
                return;
            }

            // ── 3. Enforce payload size limit (32 KB) ────────────────────────
            if (bodyBytes > MAX_BODY_BYTES) {
                sendError(res, 413, 'Payload Too Large. Maximum request body size is 32,768 bytes.',
                          correlationId, requestBody, sourceIp, bodyBytes);
                return;
            }

            // ── 4. Validate the body is parseable JSON ───────────────────────
            if (String.isNotBlank(requestBody)) {
                try {
                    JSON.deserializeUntyped(requestBody);
                } catch (JSONException je) {
                    sendError(res, 400, 'Bad Request. Request body is not valid JSON: ' + je.getMessage(),
                              correlationId, requestBody, sourceIp, bodyBytes);
                    return;
                }
            }

            // ── 5. Build echo response ───────────────────────────────────────
            Map<String, Object> echoPayload = new Map<String, Object>{
                'status'        => 'success',
                'correlationId' => correlationId,
                'echo'          => String.isNotBlank(requestBody)
                                   ? JSON.deserializeUntyped(requestBody)
                                   : new Map<String, Object>(),
                'receivedAt'    => String.valueOf(DateTime.now()),
                'endpoint'      => ENDPOINT_NAME
            };

            String responseBody = JSON.serializePretty(echoPayload);

            // ── 6. Set response ──────────────────────────────────────────────
            res.statusCode   = 200;
            res.responseBody = Blob.valueOf(responseBody);
            res.headers.put('Content-Type', 'application/json');
            res.headers.put(CORR_HEADER, correlationId);

            // ── 7. Log success (synchronous — no @future) ───────────────────
            logRequest(
                correlationId, 'POST', requestBody, responseBody,
                200, 'Success', null, sourceIp, bodyBytes
            );

        } catch (Exception e) {
            // ── 8. Catch-all — log and return 500 ───────────────────────────
            String errMsg = e.getTypeName() + ': ' + e.getMessage()
                            + ' | Line: ' + e.getLineNumber();
            sendError(res, 500, 'Internal Server Error. Contact the Salesforce admin.',
                      correlationId, requestBody, sourceIp, bodyBytes, errMsg);
        }
    }


    // ── Private: send error response + log ──────────────────────────────────
    private static void sendError(
        RestResponse res,
        Integer      statusCode,
        String       userMessage,
        String       correlationId,
        String       requestBody,
        String       sourceIp,
        Integer      bodyBytes
    ) {
        sendError(res, statusCode, userMessage, correlationId,
                  requestBody, sourceIp, bodyBytes, null);
    }

    private static void sendError(
        RestResponse res,
        Integer      statusCode,
        String       userMessage,
        String       correlationId,
        String       requestBody,
        String       sourceIp,
        Integer      bodyBytes,
        String       internalError
    ) {
        Map<String, Object> errorPayload = new Map<String, Object>{
            'status'        => 'error',
            'correlationId' => correlationId,
            'statusCode'    => statusCode,
            'message'       => userMessage,
            'timestamp'     => String.valueOf(DateTime.now())
        };

        String responseBody = JSON.serializePretty(errorPayload);

        res.statusCode   = statusCode;
        res.responseBody = Blob.valueOf(responseBody);
        res.headers.put('Content-Type', 'application/json');
        res.headers.put(CORR_HEADER, correlationId);

        String logStatus = (statusCode == 413 || statusCode == 415 || statusCode == 400)
                           ? 'Rejected'
                           : 'Error';

        logRequest(
            correlationId, 'POST', requestBody, responseBody,
            statusCode, logStatus,
            String.isNotBlank(internalError) ? internalError : userMessage,
            sourceIp, bodyBytes
        );
    }


    // ── Private: write to AI_Navigator_Request_Log__c (synchronous DML) ────────────
    // ✅ Removed @future — DML now executes in the same transaction as the
    //    REST call, guaranteeing the record is always inserted. Using @future
    //    caused the insert to be silently dropped when the async job failed
    //    to enqueue or when the parent transaction had governor limit issues.
    private static void logRequest(
        String  correlationId,
        String  httpMethod,
        String  requestBody,
        String  responseBody,
        Integer statusCode,
        String  status,
        String  errorMessage,
        String  sourceIp,
        Integer bodyBytes
    ) {
        try {
            AI_Navigator_Request_Log__c logRecord = new AI_Navigator_Request_Log__c(
                Request_Timestamp__c  = DateTime.now(),
                HTTP_Method__c        = httpMethod,
                Endpoint_Name__c      = ENDPOINT_NAME,
                Request_Body__c       = requestBody,
                Response_Body__c      = responseBody,
                Status__c             = status,
                HTTP_Status_Code__c   = statusCode,
                Correlation_ID__c     = correlationId,
                Error_Message__c      = errorMessage,
                Source_IP__c          = sourceIp,
                Request_Size_Bytes__c = bodyBytes
            );
            insert logRecord;
        } catch (DmlException de) {
            // Fail silently — logging must never break the API response
             // TEMPORARY — remove after diagnosing
            throw new AuraHandledException(
                'LOG INSERT FAILED: ' + de.getMessage() + 
                ' | Status: ' + de.getNumDml() + 
                ' | Fields: ' + de.getDmlFieldNames(0)
            );
        }
    }
}
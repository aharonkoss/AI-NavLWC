/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 09-06-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class AI_Navigator_HeaderController {

    private static String generateCorrelationId() {
        String unixMs = String.valueOf(DateTime.now().getTime());
        // 8 characters of hex (e.g. e29f432d)
        String hex = EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 8).toLowerCase();
        return 'SF-' + unixMs + '-' + hex;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET Notification Signals — GET /v1/user/notifications/signals
    // ─────────────────────────────────────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String getNotificationSignals() {
        String correlationId = generateCorrelationId();
        String path = '/v1/user/notifications/signals';
        String userId = UserInfo.getUserId();

        try {
            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);

            // Force-set header to guarantee it is present on outgoing request
            req.setHeader('X-Correlation-Id', correlationId);
            req.setHeader('Content-Type', 'application/json');

            System.debug(LoggingLevel.INFO, '⚡ Correlation ID sent: ' + req.getHeader('X-Correlation-Id'));

            HttpResponse res = new Http().send(req);

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else if (res.getStatusCode() == 404) {
                return JSON.serialize(new Map<String, Object>{
                    'notifications'   => new List<Object>(),
                    'count'           => 0,
                    'totalSignals'    => 0,
                    'totalNewSignals' => 0,
                    'lastSeenAt'      => null
                });
            } else {
                throw createHandledException('API Error [HTTP ' + res.getStatusCode() + ']: ' + res.getBody());
            }

        } catch (AuraHandledException ahe) {
            logError('AI_Navigator_HeaderController.getNotificationSignals', 'GET', correlationId, ahe.getMessage());
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Exception: ' + e.getMessage() + ' | ' + e.getStackTraceString());
            logError('AI_Navigator_HeaderController.getNotificationSignals', 'GET', correlationId, e.getMessage() + ' | ' + e.getStackTraceString());
            throw createHandledException(e.getMessage());
        }
    }

    private static void logError(String endpointName, String httpMethod, String correlationId, String errorMessage) {
        try {
            insert new AI_Navigator_Request_Log__c(
                Name              = (httpMethod + ' /v1/user/notifications/signals').left(80),
                HTTP_Method__c    = httpMethod,
                Endpoint_Name__c  = endpointName,
                Response_Body__c  = errorMessage,
                Status__c         = 'Failed',
                Correlation_ID__c = correlationId
            );
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR, 'Log write failed: ' + logEx.getMessage());
        }
    }

    private static AuraHandledException createHandledException(String message) {
        AuraHandledException ex = new AuraHandledException(message);
        ex.setMessage(message);
        return ex;
    }
}
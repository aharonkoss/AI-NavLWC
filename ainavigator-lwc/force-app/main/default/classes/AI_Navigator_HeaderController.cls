/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 09-22-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class AI_Navigator_HeaderController {
        public class SignalResponse {
        public Integer count;
        public Integer totalSignals;
        public Integer totalNewSignals;
        public String lastSeenAt;
        public List<SignalItem> notifications;
    }

    public class SignalItem {
        public String companyId;
        public String companyName;
        public Integer signalCount;
        public Integer newSignalCount;
        public String signalSummary;
        public String latestSignalName;
        public String latestDetectedAt;
        public String priority;
    }

    private static CustomNotificationType notificationType;

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
/**
     * Executes GET /v1/user/notifications/signals for any specified userId
     */
    public static String getNotificationSignalsForUser(String userId) {
        String correlationId = generateCorrelationId();
        String path = '/v1/user/notifications/signals';

        try {
            HttpRequest req = AzureHttpService.buildRequest('GET', path, correlationId, userId);
            req.setHeader('X-Correlation-Id', correlationId);
            req.setHeader('Content-Type', 'application/json');

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
            logError('AI_Navigator_HeaderController.getNotificationSignals', 'GET', correlationId, e.getMessage() + ' | ' + e.getStackTraceString());
            throw createHandledException(e.getMessage());
        }
    }

    /**
     * Calls the Azure endpoint, filters signals occurring within the last 60 minutes,
     * and pushes Custom Notifications to the Salesforce bell icon.
     */
    public static Integer processNotificationSignals(String userId) {
        String responseJson = getNotificationSignalsForUser(userId);
        if (String.isBlank(responseJson)) {
            return 0;
        }

        SignalResponse responseData;
        try {
            responseData = (SignalResponse) JSON.deserialize(responseJson, SignalResponse.class);
        } catch (Exception parseEx) {
            System.debug(LoggingLevel.ERROR, 'JSON Parse Error for User ' + userId + ': ' + parseEx.getMessage());
            return 0;
        }

        if (responseData == null || responseData.notifications == null || responseData.notifications.isEmpty()) {
            return 0;
        }

        CustomNotificationType notifType = getNotificationType();
        if (notifType == null) {
            System.debug(LoggingLevel.ERROR, 'CustomNotificationType AI_Navigator_Notification not found.');
            return 0;
        }

        // Filter: Detect signals from the past hour
        DateTime oneHourAgo = DateTime.now().addHours(-1);
        Integer sentCount = 0;
        Set<String> processedSignalsInBatch = new Set<String>();

        for (SignalItem item : responseData.notifications) {
            if (String.isBlank(item.latestDetectedAt)) {
                continue;
            }

            DateTime detectedAt;
            try {
                // Parse ISO 8601 string
                detectedAt = (DateTime) JSON.deserialize('"' + item.latestDetectedAt + '"', DateTime.class);
            } catch (Exception dateEx) {
                System.debug(LoggingLevel.WARN, 'Could not parse latestDetectedAt: ' + item.latestDetectedAt);
                continue;
            }

            // Only notify if detected within the last hour
            if (detectedAt >= oneHourAgo) {
                String dedupKey = item.companyId + '|' + item.latestDetectedAt;
                if (processedSignalsInBatch.contains(dedupKey)) {
                    continue; // Skip in-flight duplicates
                }
                processedSignalsInBatch.add(dedupKey);

                sendBellNotification(notifType.Id, userId, item);
                sentCount++;
            }
        }
        return sentCount;
    }

    /**
     * @param userId The User to sync signals for
     * @param processAll If true, bypasses the 1-hour filter and sends bell notifications for ALL signals
     */
    public static Integer processNotificationSignals(String userId, Boolean processAll) {
        String responseJson = getNotificationSignalsForUser(userId);
        if (String.isBlank(responseJson)) {
            return 0;
        }

        SignalResponse responseData;
        try {
            responseData = (SignalResponse) JSON.deserialize(responseJson, SignalResponse.class);
        } catch (Exception parseEx) {
            System.debug(LoggingLevel.ERROR, 'JSON Parse Error for User ' + userId + ': ' + parseEx.getMessage());
            return 0;
        }

        if (responseData == null || responseData.notifications == null || responseData.notifications.isEmpty()) {
            return 0;
        }

        CustomNotificationType notifType = getNotificationType();
        if (notifType == null) {
            System.debug(LoggingLevel.ERROR, 'CustomNotificationType AI_Navigator_Notification not found.');
            return 0;
        }

        DateTime oneHourAgo = DateTime.now().addHours(-1);
        Integer sentCount = 0;
        Set<String> processedSignalsInBatch = new Set<String>();

        for (SignalItem item : responseData.notifications) {
            DateTime detectedAt;
            if (String.isNotBlank(item.latestDetectedAt)) {
                try {
                    detectedAt = (DateTime) JSON.deserialize('"' + item.latestDetectedAt + '"', DateTime.class);
                } catch (Exception dateEx) {
                    System.debug(LoggingLevel.WARN, 'Could not parse latestDetectedAt: ' + item.latestDetectedAt);
                }
            }

            // CRITERIA: If processAll is true, send ALL signals. Otherwise, only signals >= 1 hour ago.
            Boolean shouldNotify = processAll || (detectedAt != null && detectedAt >= oneHourAgo);

            if (shouldNotify) {
                String dedupKey = item.companyId + '|' + (item.latestDetectedAt != null ? item.latestDetectedAt : item.latestSignalName);
                if (processedSignalsInBatch.contains(dedupKey)) {
                    continue; // Skip in-flight duplicates within same response
                }
                processedSignalsInBatch.add(dedupKey);

                sendBellNotification(notifType.Id, userId, item);
                sentCount++;
            }
        }
        return sentCount;
    }
    private static void sendBellNotification(Id notificationTypeId, String targetUserId, SignalItem item) {
        try {
            Messaging.CustomNotification notification = new Messaging.CustomNotification();
            
            String title = String.isNotBlank(item.companyName) 
                ? item.companyName 
                : 'AI Navigator Alert';
            
            String body = String.isNotBlank(item.latestSignalName) 
                ? item.latestSignalName 
                : (String.isNotBlank(item.signalSummary) ? item.signalSummary : 'New signal detected.');

            notification.setTitle(title.left(250));
            notification.setBody(body.left(750));
            notification.setNotificationTypeId(notificationTypeId);
            // Target is mandatory in Salesforce Messaging API. Using User's Id fulfills requirement without navigation.
            notification.setTargetId(targetUserId);

            notification.send(new Set<String>{ targetUserId });
        } catch (Exception ex) {
            System.debug(LoggingLevel.ERROR, 'Failed to send Custom Notification: ' + ex.getMessage());
        }
    }

    private static CustomNotificationType getNotificationType() {
        if (notificationType == null) {
            List<CustomNotificationType> types = [
                SELECT Id, DeveloperName 
                FROM CustomNotificationType 
                WHERE DeveloperName = 'AI_Navigator_Notification' 
                LIMIT 1
            ];
            if (!types.isEmpty()) {
                notificationType = types[0];
            }
        }
        return notificationType;
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
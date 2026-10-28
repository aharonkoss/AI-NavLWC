/**
 * @description Dedicated HTTP service for outbound Azure APIM Prospecting Discovery calls.
 *              Hits the exact APIM root domain (https://apim-pi-ain-dev-eus-01.azure-api.net)
 *              without the Named Credential's '/api' subpath.
 * @group AI Navigator - Apex
 */
public without sharing class ProspectingHttpService {

    private static final String BASE_HOST = 'https://apim-pi-ain-dev-eus-01.azure-api.net';
    private static final Integer DEFAULT_TIMEOUT_MS = 60000;

    /**
     * Build an HttpRequest specifically for root-level prospecting APIM endpoints.
     * Hits https://apim-pi-ain-dev-eus-01.azure-api.net/prospecting/... directly.
     *
     * @param method           HTTP verb: POST, GET
     * @param path             Path, e.g. /prospecting/v1/user/prospects/ai-recommendations
     * @param correlationId    UUID generated per request
     * @param submittingUserId Salesforce User Id of the submitting user
     * @return Fully configured HttpRequest
     */
    public static HttpRequest buildRequest(
        String method,
        String path,
        String correlationId,
        String submittingUserId
    ) {
        AI_Navigator_Config__mdt config = loadConfig();

        HttpRequest req = new HttpRequest();

        String cleanPath = path.startsWith('/') ? path : '/' + path;
        req.setEndpoint(BASE_HOST + cleanPath);
        req.setMethod(method);
        req.setTimeout(
            config.Callout_Timeout_Ms__c != null
                ? Integer.valueOf(config.Callout_Timeout_Ms__c)
                : DEFAULT_TIMEOUT_MS
        );

        // Required headers — matched to Azure APIM contract
        req.setHeader('Content-Type',               'application/json');
        req.setHeader('Accept',                     'application/json');
        req.setHeader('Ocp-Apim-Subscription-Key',  config.ApimSubscriptionKey__c);
        req.setHeader('X-Client-Id',                config.Client_Id__c);
        req.setHeader('X-User-Id',
            String.isNotBlank(submittingUserId) ? submittingUserId : UserInfo.getUserId()
        );
        req.setHeader('X-Correlation-Id',           correlationId);

        return req;
    }

    /**
     * Parse a standard Azure error response envelope and return a readable message.
     */
    public static String parseErrorResponse(HttpResponse res) {
        try {
            Map<String, Object> body =
                (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            String msg    = (String) body.get('message');
            String code   = (String) body.get('code');
            String corrId = (String) body.get('correlationId');
            return (code   != null ? '[' + code   + '] ' : '')
                 + (msg    != null ? msg            : res.getBody())
                 + (corrId != null ? ' (correlationId: ' + corrId + ')' : '');
        } catch (Exception e) {
            return 'HTTP ' + res.getStatusCode() + ' — ' + res.getBody();
        }
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private static AI_Navigator_Config__mdt loadConfig() {
        List<AI_Navigator_Config__mdt> configs = [
            SELECT Named_Credential_Name__c, ApimSubscriptionKey__c, Client_Id__c, Callout_Timeout_Ms__c, Is_Active__c
            FROM   AI_Navigator_Config__mdt
            WHERE  DeveloperName = 'Dev'
            AND    NamespacePrefix = null
            LIMIT  1
        ];

        if (configs.isEmpty()) {
            configs = [
                SELECT Named_Credential_Name__c, ApimSubscriptionKey__c, Client_Id__c, Callout_Timeout_Ms__c, Is_Active__c
                FROM   AI_Navigator_Config__mdt
                WHERE  DeveloperName = 'Dev'
                LIMIT  1
            ];
        }

        if (configs.isEmpty()) {
            throw new ProspectingHttpServiceException(
                'AI_Navigator_Config__mdt "Dev" record is missing.'
            );
        }
        if (!configs[0].Is_Active__c) {
            throw new ProspectingHttpServiceException(
                'Azure callouts are disabled via kill switch (Is_Active__c = false).'
            );
        }
        return configs[0];
    }

    public class ProspectingHttpServiceException extends Exception {}
}
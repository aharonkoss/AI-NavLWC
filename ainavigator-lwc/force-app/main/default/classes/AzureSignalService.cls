/**
 * AzureSignalService
 *
 * Triggers on-demand signal analysis for a company.
 * Called when a user clicks "Refresh Signals" in the LWC.
 *
 * Usage:
 *   AzureSignalService.requestSignalAnalysis(companyId, recencyFilter);
 */
public without sharing class AzureSignalService {

    public static void requestSignalAnalysis(String companyId, String recencyFilter) {
        List<AI_Navigator_Company__c> companies = [
            SELECT Id, Name, Website__c, Industry__c, Client_Type__c
            FROM AI_Navigator_Company__c
            WHERE Id = :companyId
            LIMIT 1
        ];

        if (companies.isEmpty()) {
            System.debug(LoggingLevel.ERROR,
                'AzureSignalService: Company not found: ' + companyId);
            return;
        }

        AI_Navigator_Company__c company = companies[0];

        // Default recency filter to month if not provided
        String filter = String.isBlank(recencyFilter) ? 'month' : recencyFilter;

        // Build payload matching SignalAnalysisRequest.v1 schema
        Map<String, Object> payload = new Map<String, Object>{
            'companyName'        => company.Name,
            'companyUrl'         => company.Website__c,
            'industry'           => company.Industry__c,
            'relationshipStatus' => mapClientTypeToRelationship(company.Client_Type__c),
            'recencyFilter'      => filter
        };

        AI_Navigator_Event_Publisher.publish(
            'SIGNAL_ANALYSIS',
            'Request',
            'SignalAnalysisRequest',
            JSON.serialize(payload)
        );
    }

    // Map Client_Type__c value to Azure relationship status enum
    private static String mapClientTypeToRelationship(String clientType) {
        if (String.isBlank(clientType)) return 'prospect';
        String ct = clientType.toLowerCase();
        if (ct.contains('existing') || ct.contains('customer')) return 'existing_customer';
        if (ct.contains('past'))                                 return 'past_customer';
        return 'prospect';
    }
}
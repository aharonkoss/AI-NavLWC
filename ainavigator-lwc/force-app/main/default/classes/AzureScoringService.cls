/**
 * AzureScoringService
 *
 * Requests an AI prospect score calculation for a company.
 * Called from LWC scoring panel or admin bulk operations.
 *
 * Usage:
 *   AzureScoringService.requestScoring(companyId);
 *   AzureScoringService.requestScoring(companyId, criteriaId);
 */
public without sharing class AzureScoringService {

    public static void requestScoring(String companyId) {
        requestScoring(companyId, null);
    }

    public static void requestScoring(String companyId, String criteriaId) {
        List<Company__c> companies = [
            SELECT Id, Name
            FROM Company__c
            WHERE Id = :companyId
            LIMIT 1
        ];

        if (companies.isEmpty()) {
            System.debug(LoggingLevel.ERROR,
                'AzureScoringService: Company not found: ' + companyId);
            return;
        }

        // Build payload matching ScoringRequest.v1 schema
        Map<String, Object> payload = new Map<String, Object>{
            'companyId' => companyId
        };

        // Only include criteriaId if explicitly provided
        if (String.isNotBlank(criteriaId)) {
            payload.put('criteriaId', criteriaId);
        }

        AI_Navigator_Event_Publisher.publish(
            'SCORING_REQUEST',
            'Request',
            'ScoringRequest',
            JSON.serialize(payload)
        );
    }
}
/**
 * AzureResearchService
 *
 * Triggers AI research for a single company.
 * Called when a user manually adds a company or clicks retry.
 * Updates Company__c status to 'processing' then fires the event.
 *
 * Usage:
 *   AzureResearchService.requestResearch(companyId);
 */
public without sharing class AzureResearchService {

    public static void requestResearch(String companyId) {
        // Fetch company record
        List<Company__c> companies = [
            SELECT Id, Name, Website__c, City__c, State__c, Status__c
            FROM Company__c
            WHERE Id = :companyId
            LIMIT 1
        ];

        if (companies.isEmpty()) {
            System.debug(LoggingLevel.ERROR,
                'AzureResearchService: Company not found: ' + companyId);
            return;
        }

        Company__c company = companies[0];

        // Update status to processing
        company.Status__c = 'processing';
        try {
            update company;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                'AzureResearchService: Failed to update Company__c status. ' +
                de.getMessage());
            return;
        }

        // Build payload matching ResearchRequest.v1 schema
        Map<String, Object> payload = new Map<String, Object>{
            'companyId'   => company.Id,
            'companyName' => company.Name,
            'website'     => company.Website__c,
            'city'        => company.City__c,
            'state'       => company.State__c
        };

        AI_Navigator_Event_Publisher.publish(
            'RESEARCH_REQUEST',
            'Request',
            'ResearchRequest',
            JSON.serialize(payload)
        );
    }
}
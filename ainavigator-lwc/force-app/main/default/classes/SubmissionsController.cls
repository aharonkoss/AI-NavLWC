/**
 * @description       : Handles bulk uploads, duplicate detection, and Submissions dashboard data.
 * @author            : AI Navigator Team
 * @last modified     : 2026-10-23
**/
public without sharing class SubmissionsController {

    private static final Map<String, String> STATE_CODE_TO_NAME = new Map<String, String>{
        'AL' => 'Alabama', 'AK' => 'Alaska', 'AZ' => 'Arizona', 'AR' => 'Arkansas',
        'CA' => 'California', 'CO' => 'Colorado', 'CT' => 'Connecticut', 'DE' => 'Delaware',
        'FL' => 'Florida', 'GA' => 'Georgia', 'HI' => 'Hawaii', 'ID' => 'Idaho',
        'IL' => 'Illinois', 'IN' => 'Indiana', 'IA' => 'Iowa', 'KS' => 'Kansas',
        'KY' => 'Kentucky', 'LA' => 'Louisiana', 'ME' => 'Maine', 'MD' => 'Maryland',
        'MA' => 'Massachusetts', 'MI' => 'Michigan', 'MN' => 'Minnesota', 'MS' => 'Mississippi',
        'MO' => 'Missouri', 'MT' => 'Montana', 'NE' => 'Nebraska', 'NV' => 'Nevada',
        'NH' => 'New Hampshire', 'NJ' => 'New Jersey', 'NM' => 'New Mexico', 'NY' => 'New York',
        'NC' => 'North Carolina', 'ND' => 'North Dakota', 'OH' => 'Ohio', 'OK' => 'Oklahoma',
        'OR' => 'Oregon', 'PA' => 'Pennsylvania', 'RI' => 'Rhode Island', 'SC' => 'South Carolina',
        'SD' => 'South Dakota', 'TN' => 'Tennessee', 'TX' => 'Texas', 'UT' => 'Utah',
        'VT' => 'Vermont', 'VA' => 'Virginia', 'WA' => 'Washington', 'WV' => 'West Virginia',
        'WI' => 'Wisconsin', 'WY' => 'Wyoming', 'DC' => 'District of Columbia'
    };

    /**
     * @description Pre-checks an incoming list of companies for duplicates across all org users.
     */
    @AuraEnabled
    public static Map<String, Object> checkDuplicates(List<Map<String, String>> companies) {
        try {
            Map<String, String> duplicateResults = new Map<String, String>();
            if (companies == null || companies.isEmpty()) {
                return new Map<String, Object>{ 'duplicates' => duplicateResults };
            }

            Map<String, String> existingLookup = getExistingCompanyOwnerMap(companies);

            for (Map<String, String> comp : companies) {
                String web = comp.get('website');
                String name = comp.get('companyName');
                String normalizedWeb = normalizeWebsite(web);
                String normalizedName = String.isNotBlank(name) ? name.trim().toLowerCase() : '';

                String matchedOwner = null;
                if (String.isNotBlank(normalizedWeb) && existingLookup.containsKey(normalizedWeb)) {
                    matchedOwner = existingLookup.get(normalizedWeb);
                } else if (String.isNotBlank(normalizedName) && existingLookup.containsKey(normalizedName)) {
                    matchedOwner = existingLookup.get(normalizedName);
                }

                if (matchedOwner != null) {
                    String key = String.isNotBlank(web) ? web : name;
                    duplicateResults.put(key, 'This company has already been submitted by ' + matchedOwner + '.');
                }
            }

            return new Map<String, Object>{
                'duplicates' => duplicateResults
            };
        } catch (Exception e) {
            throw new AuraHandledException('Error checking duplicate companies: ' + e.getMessage());
        }
    }

    /**
     * @description Processes bulk upload files: filters out duplicates, creates the submission record,
     *              inserts valid companies, and creates associated Leads.
     */
    @AuraEnabled
    public static Map<String, Object> processUploadWithCompanies(
        String fileName, 
        List<Map<String, Object>> companiesData
    ) {
        Savepoint sp = Database.setSavepoint();
        try {
            Id currentUserId = UserInfo.getUserId();
            String correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();

            if (companiesData == null || companiesData.isEmpty()) {
                throw new AuraHandledException('No companies provided for upload.');
            }

            // 1. Build lookup for all existing companies in Salesforce
            List<Map<String, String>> rowsToCheck = new List<Map<String, String>>();
            for (Map<String, Object> row : companiesData) {
                rowsToCheck.add(new Map<String, String>{
                    'website'     => (String) row.get('website'),
                    'companyName' => (String) row.get('companyName')
                });
            }
            Map<String, String> existingOwners = getExistingCompanyOwnerMap(rowsToCheck);

            // 2. Separate duplicates from new submissions
            List<Map<String, Object>> duplicateRows = new List<Map<String, Object>>();
            List<AI_Navigator_Company__c> companiesToInsert = new List<AI_Navigator_Company__c>();
            List<Lead> leadsToInsert = new List<Lead>();

            for (Map<String, Object> row : companiesData) {
                String compName   = (String) row.get('companyName');
                String website    = (String) row.get('website');
                String city       = (String) row.get('city');
                String state      = (String) row.get('state');
                String stage      = (String) row.get('stage');
                String clientType = (String) row.get('clientType');

                String normWeb  = normalizeWebsite(website);
                String normName = String.isNotBlank(compName) ? compName.trim().toLowerCase() : '';

                String matchedOwner = null;
                if (String.isNotBlank(normWeb) && existingOwners.containsKey(normWeb)) {
                    matchedOwner = existingOwners.get(normWeb);
                } else if (String.isNotBlank(normName) && existingOwners.containsKey(normName)) {
                    matchedOwner = existingOwners.get(normName);
                }

                // If duplicate, skip and record error message
                if (matchedOwner != null) {
                    duplicateRows.add(new Map<String, Object>{
                        'companyName' => compName,
                        'website'     => website,
                        'message'     => 'This company has already been submitted by ' + matchedOwner + '.'
                    });
                    continue;
                }

                // If valid non-duplicate, stage for insertion
                String companyCorrelationId = AI_Navigator_Event_Publisher.generateCorrelationId();
                AI_Navigator_Company__c newCompany = new AI_Navigator_Company__c(
                    Name                 = compName,
                    Website__c           = website,
                    City__c              = city,
                    State__c             = state,
                    Stage_List__c        = String.isNotBlank(stage) ? stage : 'PreCall',
                    Client_Type_List__c  = String.isNotBlank(clientType) ? clientType : 'Prospect',
                    Status__c            = 'pending',
                    Correlation_Id__c    = companyCorrelationId,
                    Is_Hidden__c         = false,
                    OwnerId              = currentUserId
                );
                companiesToInsert.add(newCompany);

                // Register in memory to avoid duplicates within the same batch upload
                if (String.isNotBlank(normWeb)) {
                    existingOwners.put(normWeb, UserInfo.getName());
                }
                if (String.isNotBlank(normName)) {
                    existingOwners.put(normName, UserInfo.getName());
                }
            }

            // 3. Create parent AI_Navigator_Submission__c record
            Integer totalCount = companiesData.size();
            Integer skippedCount = duplicateRows.size();
            Integer validCount = companiesToInsert.size();

            AI_Navigator_Submission__c submission = new AI_Navigator_Submission__c(
                Submission_Id__c       = correlationId,
                File_Name__c           = fileName,
                Status__c              = validCount > 0 ? 'processing' : 'completed',
                Total_Companies__c     = totalCount,
                Processed_Companies__c = 0,
                Failed_Companies__c    = skippedCount,
                Submitted_At__c        = DateTime.now(),
                Submitted_By__c        = currentUserId
            );
            insert submission;

            // 4. Insert companies and enqueue jobs for valid ones
            if (!companiesToInsert.isEmpty()) {
                insert companiesToInsert;

                for (AI_Navigator_Company__c comp : companiesToInsert) {
                    Lead newLead = new Lead(
                        LastName  = comp.Name,
                        Company   = comp.Name,
                        Website   = comp.Website__c,
                        City      = comp.City__c,
                        Status    = 'Open - Not Contacted',
                        AIN_Id__c = comp.Id
                    );
                    populateLeadAddress(newLead, comp.State__c);
                    leadsToInsert.add(newLead);

                    System.enqueueJob(new AzureManualCompanyCallout(
                        comp.Id, comp.Name, comp.Website__c, comp.City__c, comp.State__c, comp.Stage_List__c, comp.Client_Type_List__c, comp.Id 
                    ));
                }

                if (!leadsToInsert.isEmpty()) {
                    insert leadsToInsert;
                }
            }

            return new Map<String, Object>{
                'success'           => true,
                'submissionId'      => submission.Submission_Id__c,
                'salesforceId'      => submission.Id,
                'fileName'          => fileName,
                'totalUploaded'     => totalCount,
                'processedCount'    => validCount,
                'skippedCount'      => skippedCount,
                'duplicates'        => duplicateRows
            };

        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Error processing upload: ' + e.getMessage());
        }
    }

    /**
     * Returns serialised list of Submission__c records for the current user.
     */
    @AuraEnabled(cacheable=true)
    public static String getSubmissions() {
        try {
            List<AI_Navigator_Submission__c> records = [
                SELECT  Id,
                        Submission_Id__c,
                        File_Name__c,
                        Status__c,
                        Total_Companies__c,
                        Processed_Companies__c,
                        Failed_Companies__c,
                        Submitted_At__c,
                        Completed_At__c,
                        Submitted_By__c
                FROM    AI_Navigator_Submission__c
                WHERE   Submitted_By__c = :UserInfo.getUserId()
                ORDER BY Submitted_At__c DESC
                LIMIT   200
            ];

            List<Map<String, Object>> result = new List<Map<String, Object>>();

            for (AI_Navigator_Submission__c s : records) {
                String source = String.isNotBlank(s.File_Name__c) ? 'Upload' : 'Input';

                Integer total     = s.Total_Companies__c     != null ? s.Total_Companies__c.intValue()     : 0;
                Integer processed = s.Processed_Companies__c != null ? s.Processed_Companies__c.intValue() : 0;
                Integer failed    = s.Failed_Companies__c    != null ? s.Failed_Companies__c.intValue()    : 0;

                Integer progressPct = (total > 0)
                    ? Math.min(100, Math.roundToLong(((Decimal) processed / total) * 100).intValue())
                    : 0;

                Boolean isComplete = (total > 0) && ((processed + failed) >= total);

                result.add(new Map<String, Object>{
                    'submissionId'      => s.Submission_Id__c,
                    'salesforceId'      => s.Id,
                    'fileName'          => s.File_Name__c,
                    'source'            => source,
                    'status'            => s.Status__c,
                    'totalCompanies'    => total,
                    'processed'         => processed,
                    'failed'            => failed,
                    'progressPct'       => progressPct,
                    'isComplete'        => isComplete,
                    'submittedAt'       => s.Submitted_At__c != null
                                            ? s.Submitted_At__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
                                            : null,
                    'completedAt'       => s.Completed_At__c != null
                                            ? s.Completed_At__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
                                            : null
                });
            }

            return JSON.serialize(result);

        } catch (Exception e) {
            throw new AuraHandledException('Error fetching submissions: ' + e.getMessage());
        }
    }

    // ── Private Helpers ───────────────────────────────────────────────────────
    private static Map<String, String> getExistingCompanyOwnerMap(List<Map<String, String>> companies) {
        Map<String, String> lookup = new Map<String, String>();
        Set<String> websites = new Set<String>();
        Set<String> names = new Set<String>();

        for (Map<String, String> comp : companies) {
            String w = comp.get('website');
            String n = comp.get('companyName');
            if (String.isNotBlank(w)) {
                websites.add(w.trim());
                websites.add(normalizeWebsite(w));
            }
            if (String.isNotBlank(n)) {
                names.add(n.trim());
            }
        }

        for (AI_Navigator_Company__c c : [
            SELECT Id, Name, Website__c, Owner.Name 
            FROM AI_Navigator_Company__c 
            WHERE Website__c IN :websites OR Name IN :names
        ]) {
            String ownerName = (c.Owner != null && String.isNotBlank(c.Owner.Name)) ? c.Owner.Name : 'another user';
            if (String.isNotBlank(c.Website__c)) {
                lookup.put(c.Website__c.toLowerCase().trim(), ownerName);
                lookup.put(normalizeWebsite(c.Website__c), ownerName);
            }
            if (String.isNotBlank(c.Name)) {
                lookup.put(c.Name.toLowerCase().trim(), ownerName);
            }
        }

        return lookup;
    }

    private static String normalizeWebsite(String web) {
        if (String.isBlank(web)) return '';
        return web.trim().toLowerCase()
            .replaceAll('^https?://', '')
            .replaceAll('^www\\.', '')
            .replaceAll('/.*$', '');
    }

    private static void populateLeadAddress(Lead leadRecord, String stateInput) {
        if (String.isBlank(stateInput)) {
            leadRecord.Country = 'United States';
            return;
        }

        String inputUpper = stateInput.trim().toUpperCase();

        if (STATE_CODE_TO_NAME.containsKey(inputUpper)) {
            leadRecord.Country = 'US';
            leadRecord.State   = inputUpper;
        } else {
            leadRecord.Country = 'United States';
            leadRecord.State   = stateInput.trim();
        }
    }
}
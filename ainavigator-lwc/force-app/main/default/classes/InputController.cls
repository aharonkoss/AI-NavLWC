/**
 * @description       : Handles company submission, Lead creation, and cross-user duplicate verification.
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public without sharing class InputController {

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
     * @description Submits a single company after verifying it hasn't been submitted previously.
     */
    @AuraEnabled
    public static String submitCompany(
        String companyName,
        String website,
        String city,
        String state,
        String stage,
        String clientType,
        Boolean isCalledFromLead 
    ) {
        String correlationId = '';
        try {
            Id currentUserId = UserInfo.getUserId();

            // 1. Check for duplicates across all users in the org
            AI_Navigator_Company__c existingCompany = findDuplicateCompany(companyName, website);
            if (existingCompany != null) {
                String ownerName = (existingCompany.Owner != null && String.isNotBlank(existingCompany.Owner.Name)) 
                    ? existingCompany.Owner.Name 
                    : 'another user';
                throw createHandledException('This company has already been submitted by ' + ownerName + '.');
            }

            // 2. Standard creation process
            correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();

            AI_Navigator_Company__c company = new AI_Navigator_Company__c(
                Name                 = companyName,
                Website__c           = website,
                City__c              = city,
                State__c             = state,
                Stage_List__c        = stage,
                Client_Type_List__c  = clientType,
                Status__c            = 'pending',
                Correlation_Id__c    = correlationId,
                Is_Hidden__c         = false,
                OwnerId              = currentUserId
            );
            insert company;

            if (isCalledFromLead == null || !isCalledFromLead) {
                Lead newLead = new Lead(
                    LastName  = companyName,
                    Company   = companyName,
                    Website   = website,
                    City      = city,
                    Status    = 'Open - Not Contacted',
                    AIN_Id__c = company.Id
                );
                populateLeadAddress(newLead, state);
                insert newLead;
            }

            System.enqueueJob(new AzureManualCompanyCallout(
                company.Id, companyName, website, city, state, stage, clientType, company.Id 
            ));

            return JSON.serialize(new Map<String, Object>{
                'success'       => true,
                'companyId'     => company.Id,
                'correlationId' => correlationId,
                'name'          => companyName,
                'status'        => 'pending'
            });

        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            logError('InputController.submitCompany', 'POST', correlationId, e.getMessage() + ' | ' + e.getStackTraceString());
            throw createHandledException(e.getMessage());
        }
    }

    /**
     * @description Bulk submission method that skips duplicate companies, 
     *              returns warning messages for duplicates, and inserts non-duplicates.
     */
    @AuraEnabled
    public static Map<String, Object> submitBulkCompanies(List<Map<String, Object>> companiesData, Boolean isCalledFromLead) {
        List<Map<String, Object>> successList = new List<Map<String, Object>>();
        List<Map<String, Object>> duplicateList = new List<Map<String, Object>>();
        List<AI_Navigator_Company__c> companiesToInsert = new List<AI_Navigator_Company__c>();
        List<Lead> leadsToInsert = new List<Lead>();

        try {
            Id currentUserId = UserInfo.getUserId();

            // Collect all websites and names for duplicate check
            Set<String> websitesToCheck = new Set<String>();
            Set<String> namesToCheck = new Set<String>();

            for (Map<String, Object> row : companiesData) {
                String web = (String) row.get('website');
                String name = (String) row.get('companyName');
                if (String.isNotBlank(web)) {
                    websitesToCheck.add(web.trim());
                    websitesToCheck.add(normalizeWebsite(web));
                }
                if (String.isNotBlank(name)) {
                    namesToCheck.add(name.trim());
                }
            }

            // Query existing records in bulk
            Map<String, String> websiteToOwner = new Map<String, String>();
            Map<String, String> nameToOwner = new Map<String, String>();

            for (AI_Navigator_Company__c existing : [
                SELECT Id, Name, Website__c, Owner.Name 
                FROM AI_Navigator_Company__c 
                WHERE Website__c IN :websitesToCheck OR Name IN :namesToCheck
            ]) {
                String ownerName = (existing.Owner != null && String.isNotBlank(existing.Owner.Name)) ? existing.Owner.Name : 'another user';
                if (String.isNotBlank(existing.Website__c)) {
                    websiteToOwner.put(existing.Website__c.toLowerCase(), ownerName);
                    websiteToOwner.put(normalizeWebsite(existing.Website__c), ownerName);
                }
                if (String.isNotBlank(existing.Name)) {
                    nameToOwner.put(existing.Name.toLowerCase(), ownerName);
                }
            }

            // Process each row: skip duplicates, prepare non-duplicates
            for (Map<String, Object> row : companiesData) {
                String companyName = (String) row.get('companyName');
                String website = (String) row.get('website');
                String city = (String) row.get('city');
                String state = (String) row.get('state');
                String stage = (String) row.get('stage');
                String clientType = (String) row.get('clientType');

                String normalizedWeb = normalizeWebsite(website);
                String existingOwner = null;

                if (String.isNotBlank(normalizedWeb) && websiteToOwner.containsKey(normalizedWeb)) {
                    existingOwner = websiteToOwner.get(normalizedWeb);
                } else if (String.isNotBlank(companyName) && nameToOwner.containsKey(companyName.toLowerCase().trim())) {
                    existingOwner = nameToOwner.get(companyName.toLowerCase().trim());
                }

                if (existingOwner != null) {
                    duplicateList.add(new Map<String, Object>{
                        'companyName' => companyName,
                        'website'     => website,
                        'message'     => 'This company has already been submitted by ' + existingOwner + '.'
                    });
                    continue;
                }

                // If not duplicate, queue for creation
                String correlationId = AI_Navigator_Event_Publisher.generateCorrelationId();
                AI_Navigator_Company__c comp = new AI_Navigator_Company__c(
                    Name                 = companyName,
                    Website__c           = website,
                    City__c              = city,
                    State__c             = state,
                    Stage_List__c        = stage,
                    Client_Type_List__c  = clientType,
                    Status__c            = 'pending',
                    Correlation_Id__c    = correlationId,
                    Is_Hidden__c         = false,
                    OwnerId              = currentUserId
                );
                companiesToInsert.add(comp);

                // Register in maps to avoid duplicates within the same batch upload
                if (String.isNotBlank(normalizedWeb)) {
                    websiteToOwner.put(normalizedWeb, UserInfo.getName());
                }
                if (String.isNotBlank(companyName)) {
                    nameToOwner.put(companyName.toLowerCase().trim(), UserInfo.getName());
                }
            }

            if (!companiesToInsert.isEmpty()) {
                insert companiesToInsert;

                for (AI_Navigator_Company__c comp : companiesToInsert) {
                    if (isCalledFromLead == null || !isCalledFromLead) {
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
                    }

                    System.enqueueJob(new AzureManualCompanyCallout(
                        comp.Id, comp.Name, comp.Website__c, comp.City__c, comp.State__c, comp.Stage_List__c, comp.Client_Type_List__c, comp.Id 
                    ));

                    successList.add(new Map<String, Object>{
                        'companyId'     => comp.Id,
                        'correlationId' => comp.Correlation_Id__c,
                        'name'          => comp.Name,
                        'website'       => comp.Website__c
                    });
                }

                if (!leadsToInsert.isEmpty()) {
                    insert leadsToInsert;
                }
            }

            return new Map<String, Object>{
                'success'    => true,
                'inserted'   => successList,
                'duplicates' => duplicateList
            };

        } catch (Exception e) {
            logError('InputController.submitBulkCompanies', 'POST', '', e.getMessage() + ' | ' + e.getStackTraceString());
            throw createHandledException(e.getMessage());
        }
    }

    // ── Duplicate Query Helper ───────────────────────────────────────────────
    private static AI_Navigator_Company__c findDuplicateCompany(String companyName, String website) {
        if (String.isNotBlank(website)) {
            String cleanWeb = website.trim();
            String domain = normalizeWebsite(cleanWeb);

            List<AI_Navigator_Company__c> matches = [
                SELECT Id, Name, Website__c, OwnerId, Owner.Name
                FROM AI_Navigator_Company__c
                WHERE Website__c = :cleanWeb
                   OR Website__c = :domain
                   OR Website__c = :('https://' + domain)
                   OR Website__c = :('https://www.' + domain)
                   OR Website__c = :('http://' + domain)
                   OR Website__c = :('http://www.' + domain)
                LIMIT 1
            ];

            if (!matches.isEmpty()) {
                return matches[0];
            }
        }

        if (String.isNotBlank(companyName)) {
            String cleanName = companyName.trim();
            List<AI_Navigator_Company__c> matches = [
                SELECT Id, Name, Website__c, OwnerId, Owner.Name
                FROM AI_Navigator_Company__c
                WHERE Name = :cleanName
                LIMIT 1
            ];

            if (!matches.isEmpty()) {
                return matches[0];
            }
        }

        return null;
    }

    private static String normalizeWebsite(String web) {
        if (String.isBlank(web)) return '';
        return web.trim().toLowerCase()
            .replaceAll('^https?://', '')
            .replaceAll('^www\\.', '')
            .replaceAll('/.*$', '');
    }

    // ── Safe Address Mapping Helper ──────────────────────────────────────────
    private static void populateLeadAddress(Lead leadRecord, String stateInput) {
        if (String.isBlank(stateInput)) {
            leadRecord.Country = 'United States';
            return;
        }

        String inputUpper = stateInput.trim().toUpperCase();

        // Check if user entered a 2-letter code (e.g., 'TN', 'AZ')
        if (STATE_CODE_TO_NAME.containsKey(inputUpper)) {
            leadRecord.Country = 'US';
            leadRecord.State   = inputUpper;
        } else {
            // User entered a full state name (e.g., 'Tennessee')
            leadRecord.Country = 'United States';
            leadRecord.State   = stateInput.trim();
        }
    }

    private static void logError(String endpointName, String httpMethod, String correlationId, String errorMessage) {
        try {
            insert new AI_Navigator_Request_Log__c(
                HTTP_Method__c      = httpMethod,
                Endpoint_Name__c    = endpointName,
                Status__c           = 'Failed',
                Correlation_ID__c   = correlationId,
                Error_Message__c    = errorMessage != null ? errorMessage.left(32768) : null
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
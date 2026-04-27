/**
 * @description Dashboard LWC controller.
 *              All methods use real SOQL against confirmed Company__c and Signal__c schemas.
 *              Zero MockDataProvider calls remain.
 * @group       AI Navigator - LWC Controllers
 * @last-modified 2026-04-24
 */
public with sharing class DashboardController {

    // ─── Dashboard Stats ──────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static String getDashboardStats() {
        try {
            Integer total      = [SELECT COUNT() FROM Company__c WITH SECURITY_ENFORCED];
            Integer processing = [SELECT COUNT() FROM Company__c WHERE Status__c = 'processing' WITH SECURITY_ENFORCED];
            Integer completed  = [SELECT COUNT() FROM Company__c WHERE Status__c = 'completed'  WITH SECURITY_ENFORCED];
            Integer opened     = [SELECT COUNT() FROM Company__c WHERE Status__c = 'opened'     WITH SECURITY_ENFORCED];

            return JSON.serialize(new Map<String, Object>{
                'totalCompanies' => total,
                'processing'     => processing,
                'completed'      => completed,
                'opened'         => opened
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching dashboard stats: ' + e.getMessage());
        }
    }

    // ─── Company List ─────────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static String getCompanies() {
        try {
            List<Company__c> records = [
                SELECT Id, Name, Website__c, City__c, State__c,
                       Status__c, Stage__c, Client_Type__c,
                       Industry__c, CreatedDate
                FROM   Company__c
                WITH   SECURITY_ENFORCED
                ORDER BY CreatedDate DESC
                LIMIT  200
            ];

            List<Map<String, Object>> result = new List<Map<String, Object>>();
            for (Company__c c : records) {
                result.add(new Map<String, Object>{
                    'companyId'  => c.Id,
                    'name'       => c.Name,
                    'website'    => c.Website__c,
                    'city'       => c.City__c,
                    'state'      => c.State__c,
                    'status'     => c.Status__c,
                    'stage'      => c.Stage__c,
                    'clientType' => c.Client_Type__c,
                    'createdAt'  => String.valueOf(c.CreatedDate)
                });
            }
            return JSON.serialize(result);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching companies: ' + e.getMessage());
        }
    }

    // ─── Signals for a Company ────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static String getSignals(String companyId) {
        try {
            if (String.isBlank(companyId)) {
                return JSON.serialize(new List<Object>());
            }

            List<Signal__c> signals = [
                SELECT Id, Signal_Type__c, Headline__c, Impact__c,
                       Priority__c, Source__c, Detected_At__c, Is_New__c
                FROM   Signal__c
                WHERE  Company__c = :companyId
                WITH   SECURITY_ENFORCED
                ORDER BY Detected_At__c DESC
                LIMIT  50
            ];

            List<Map<String, Object>> result = new List<Map<String, Object>>();
            for (Signal__c s : signals) {
                result.add(new Map<String, Object>{
                    'signalType'        => s.Signal_Type__c,
                    'signalCategory'    => s.Signal_Type__c,
                    'signalName'        => s.Headline__c,
                    'signalDescription' => s.Impact__c,
                    'priority'          => s.Priority__c,
                    'confidence'        => 'Medium',
                    'timeframe'         => 'Near-term',
                    'eventDate'         => s.Detected_At__c != null
                                            ? String.valueOf(s.Detected_At__c.date())
                                            : null,
                    'sourceUrls'        => String.isNotBlank(s.Source__c)
                                            ? new List<String>{ s.Source__c }
                                            : new List<String>(),
                    'keyIndicators'     => new List<String>(),
                    'suggestedActions'  => '',
                    'isNew'             => s.Is_New__c
                });
            }
            return JSON.serialize(result);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching signals: ' + e.getMessage());
        }
    }

    // ─── Update Company ───────────────────────────────────────────────────────

    @AuraEnabled
    public static String updateCompany(String companyId, String stage, String clientType) {
        try {
            if (String.isBlank(companyId)) {
                throw new AuraHandledException('companyId is required.');
            }

            List<Company__c> records = [
                SELECT Id, Stage__c, Client_Type__c
                FROM   Company__c
                WHERE  Id = :companyId
                WITH   SECURITY_ENFORCED
                LIMIT  1
            ];
            if (records.isEmpty()) {
                throw new AuraHandledException('Company not found: ' + companyId);
            }

            Company__c company = records[0];
            if (String.isNotBlank(stage))      { company.Stage__c       = stage;      }
            if (String.isNotBlank(clientType)) { company.Client_Type__c = clientType; }

            update company;

            return JSON.serialize(new Map<String, Object>{
                'success'    => true,
                'companyId'  => companyId,
                'stage'      => company.Stage__c,
                'clientType' => company.Client_Type__c
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (DmlException dmlEx) {
            throw new AuraHandledException('Could not update the company record. ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException('Error updating company: ' + e.getMessage());
        }
    }

    // ─── Delete Company ───────────────────────────────────────────────────────

    @AuraEnabled
    public static String deleteCompany(String companyId) {
        try {
            if (String.isBlank(companyId)) {
                throw new AuraHandledException('companyId is required.');
            }

            List<Company__c> records = [
                SELECT Id FROM Company__c
                WHERE  Id = :companyId
                WITH   SECURITY_ENFORCED
                LIMIT  1
            ];

            if (!records.isEmpty()) {
                delete records[0];
            }

            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (DmlException dmlEx) {
            throw new AuraHandledException('Could not delete the company record. ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting company: ' + e.getMessage());
        }
    }

    // ─── Retry Company ────────────────────────────────────────────────────────

    @AuraEnabled
    public static String retryCompany(String companyId) {
        try {
            if (String.isBlank(companyId)) {
                throw new AuraHandledException('companyId is required.');
            }

            List<Company__c> records = [
                SELECT Id FROM Company__c
                WHERE  Id = :companyId
                WITH   SECURITY_ENFORCED
                LIMIT  1
            ];
            if (records.isEmpty()) {
                throw new AuraHandledException('Company not found: ' + companyId);
            }

            // Confirmed signature: requestResearch(String companyId)
            AzureResearchService.requestResearch(companyId);

            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId,
                'status'    => 'processing'
            });
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrying company: ' + e.getMessage());
        }
    }

    // ─── Call Plan (pass-through) ─────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static String getCallPlan(String companyId) {
        try {
            return CompanyDetailController.getCallPlan(companyId);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching call plan: ' + e.getMessage());
        }
    }

    // ─── Company Info (pass-through) ──────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static String getCompanyInfo(String companyId) {
        try {
            return CompanyDetailController.getCompany(companyId);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching company info: ' + e.getMessage());
        }
    }
}
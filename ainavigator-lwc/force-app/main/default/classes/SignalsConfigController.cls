/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 05-16-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class SignalsConfigController {

    private static final String CONFIG_PATH = '/v1/user/signals/config';

    // Signal definitions – each entry maps display metadata to its Azure flag key.
    // Apex Map literals require the  key => value  syntax.
    private static final List<Map<String, Object>> SIGNAL_DEFINITIONS =
        new List<Map<String, Object>>{

        // ── Capital Events P5 ────────────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'capital-events',
            'label'         => 'Capital Events',
            'priorityLevel' => 5,
            'id'            => 'ce-1',
            'azureKey'      => 'capital_event_imminent',
            'name'          => 'Capital Event or Imminent Capital Need',
            'description'   => 'Acquisition language, CapEx acceleration, facility expansion, debt maturity within 12 months',
            'priority'      => 'P5',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'capital-events',
            'label'         => 'Capital Events',
            'priorityLevel' => 5,
            'id'            => 'ce-2',
            'azureKey'      => 'ownership_change',
            'name'          => 'Ownership Change or New Financial Investor',
            'description'   => 'PE acquisition, minority investment, strategic investor, board changes tied to ownership',
            'priority'      => 'P5',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'capital-events',
            'label'         => 'Capital Events',
            'priorityLevel' => 5,
            'id'            => 'ce-3',
            'azureKey'      => 'ma_announcement',
            'name'          => 'M&A Announcement – Buyer or Target',
            'description'   => 'Company announced as acquisition target or acquirer',
            'priority'      => 'P5',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'capital-events',
            'label'         => 'Capital Events',
            'priorityLevel' => 5,
            'id'            => 'ce-4',
            'azureKey'      => 'pe_sponsor_involvement',
            'name'          => 'PE or Sponsor Involvement',
            'description'   => 'Private equity or financial sponsor takes stake or increases involvement',
            'priority'      => 'P5',
            'timeframe'     => 'Immediate'
        },

        // ── Bank Strain P4 ───────────────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'bank-strain',
            'label'         => 'Bank Strain',
            'priorityLevel' => 4,
            'id'            => 'bs-1',
            'azureKey'      => 'credit_facility_maturity',
            'name'          => 'Credit Facility Maturity or Renewal Signal',
            'description'   => 'Existing revolving or term credit matures within 12 months',
            'priority'      => 'P4',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'bank-strain',
            'label'         => 'Bank Strain',
            'priorityLevel' => 4,
            'id'            => 'bs-2',
            'azureKey'      => 'bank_relationship_strain',
            'name'          => 'Bank Relationship Strain or Covenant Breach',
            'description'   => 'Signals of deteriorating lender relationship or covenant pressure',
            'priority'      => 'P4',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'bank-strain',
            'label'         => 'Bank Strain',
            'priorityLevel' => 4,
            'id'            => 'bs-3',
            'azureKey'      => 'refinancing_activity',
            'name'          => 'Refinancing or Debt Restructuring Activity',
            'description'   => 'Public or inferred signs of debt restructuring or refinancing conversations',
            'priority'      => 'P4',
            'timeframe'     => 'Near-term'
        },

        // ── Leadership Changes P4 ────────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'leadership-changes',
            'label'         => 'Leadership Changes',
            'priorityLevel' => 4,
            'id'            => 'lc-1',
            'azureKey'      => 'cfo_departure',
            'name'          => 'CFO Departure or Transition',
            'description'   => 'Chief Financial Officer announced departure or replacement',
            'priority'      => 'P4',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'leadership-changes',
            'label'         => 'Leadership Changes',
            'priorityLevel' => 4,
            'id'            => 'lc-2',
            'azureKey'      => 'ceo_transition',
            'name'          => 'CEO or Owner Transition',
            'description'   => 'Ownership or top executive leadership change announced or inferred',
            'priority'      => 'P4',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'leadership-changes',
            'label'         => 'Leadership Changes',
            'priorityLevel' => 4,
            'id'            => 'lc-3',
            'azureKey'      => 'board_change',
            'name'          => 'Board Composition Change',
            'description'   => 'New board member, activist investor, or director departure',
            'priority'      => 'P4',
            'timeframe'     => 'Near-term'
        },

        // ── Risk Signals P3 ──────────────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'risk-signals',
            'label'         => 'Risk Signals',
            'priorityLevel' => 3,
            'id'            => 'rs-1',
            'azureKey'      => 'regulatory_investigation',
            'name'          => 'Regulatory Investigation or Compliance Issue',
            'description'   => 'State or federal regulatory body opened review of company practices',
            'priority'      => 'P3',
            'timeframe'     => 'Immediate'
        },
        new Map<String,Object>{
            'categoryId'    => 'risk-signals',
            'label'         => 'Risk Signals',
            'priorityLevel' => 3,
            'id'            => 'rs-2',
            'azureKey'      => 'litigation_risk',
            'name'          => 'Significant Litigation or Legal Action',
            'description'   => 'Major lawsuit filed against or by the company',
            'priority'      => 'P3',
            'timeframe'     => 'Near-term'
        },
        new Map<String,Object>{
            'categoryId'    => 'risk-signals',
            'label'         => 'Risk Signals',
            'priorityLevel' => 3,
            'id'            => 'rs-3',
            'azureKey'      => 'credit_downgrade',
            'name'          => 'Credit Rating Downgrade or Watch',
            'description'   => 'Credit agency placed company on negative watch or downgraded rating',
            'priority'      => 'P3',
            'timeframe'     => 'Immediate'
        },

        // ── Strategic Changes P2 ─────────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'strategic-changes',
            'label'         => 'Strategic Changes',
            'priorityLevel' => 2,
            'id'            => 'sc-1',
            'azureKey'      => 'new_market_expansion',
            'name'          => 'New Market or Geographic Expansion',
            'description'   => 'Company announced entry into new markets or geographies',
            'priority'      => 'P2',
            'timeframe'     => 'Near-term'
        },
        new Map<String,Object>{
            'categoryId'    => 'strategic-changes',
            'label'         => 'Strategic Changes',
            'priorityLevel' => 2,
            'id'            => 'sc-2',
            'azureKey'      => 'partnership_announcement',
            'name'          => 'Major Partnership or JV Announcement',
            'description'   => 'Strategic partnership, joint venture, or distribution agreement announced',
            'priority'      => 'P2',
            'timeframe'     => 'Near-term'
        },
        new Map<String,Object>{
            'categoryId'    => 'strategic-changes',
            'label'         => 'Strategic Changes',
            'priorityLevel' => 2,
            'id'            => 'sc-3',
            'azureKey'      => 'product_launch',
            'name'          => 'New Product or Service Launch',
            'description'   => 'Significant new offering launched that implies capital deployment',
            'priority'      => 'P2',
            'timeframe'     => 'Long-term'
        },

        // ── Growth Signals P2 ────────────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'growth-signals',
            'label'         => 'Growth Signals',
            'priorityLevel' => 2,
            'id'            => 'gs-1',
            'azureKey'      => 'hiring_surge',
            'name'          => 'Significant Hiring Surge',
            'description'   => 'Rapid headcount growth signalling expansion capital needs',
            'priority'      => 'P2',
            'timeframe'     => 'Near-term'
        },
        new Map<String,Object>{
            'categoryId'    => 'growth-signals',
            'label'         => 'Growth Signals',
            'priorityLevel' => 2,
            'id'            => 'gs-2',
            'azureKey'      => 'facility_expansion',
            'name'          => 'Facility Expansion or New Location',
            'description'   => 'New office, plant, or warehouse opening announced',
            'priority'      => 'P2',
            'timeframe'     => 'Near-term'
        },

        // ── Opportunity Signals P1 ───────────────────────────────────────────
        new Map<String,Object>{
            'categoryId'    => 'opportunity-signals',
            'label'         => 'Opportunity Signals',
            'priorityLevel' => 1,
            'id'            => 'os-1',
            'azureKey'      => 'award_or_contract',
            'name'          => 'Government or Large Commercial Contract Award',
            'description'   => 'Company awarded a significant contract creating a working-capital opportunity',
            'priority'      => 'P1',
            'timeframe'     => 'Long-term'
        },
        new Map<String,Object>{
            'categoryId'    => 'opportunity-signals',
            'label'         => 'Opportunity Signals',
            'priorityLevel' => 1,
            'id'            => 'os-2',
            'azureKey'      => 'industry_recognition',
            'name'          => 'Industry Award or Recognition',
            'description'   => 'Award or certification signalling company health and growth trajectory',
            'priority'      => 'P1',
            'timeframe'     => 'Long-term'
        }
    };

    // ── GET /v1/user/signals/config ─────────────────────────────────────────
    @AuraEnabled(cacheable=false)
    public static String getSignalsConfig() {
        String correlationId = AiNavigatorEventService.generateCorrelationId();
        String userId        = UserInfo.getUserId();
        try {
            HttpRequest  req = AzureHttpService.buildRequest('GET', CONFIG_PATH, correlationId, userId);
            HttpResponse res = new Http().send(req);
            logRequest('GET', null, res, correlationId);

            if (res.getStatusCode() == 200) {
                Map<String, Object> azureFlags = parseBody(res.getBody());
                return JSON.serialize(buildCategories(azureFlags));
            }

            System.debug(LoggingLevel.WARN,
                'SignalsConfigController.getSignalsConfig – Azure returned HTTP ' +
                res.getStatusCode() + ': ' + res.getBody());
            return JSON.serialize(buildCategories(new Map<String, Object>()));

        } catch (AzureHttpService.AzureHttpServiceException configEx) {
            throw new AuraHandledException(configEx.getMessage());
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'SignalsConfigController.getSignalsConfig – ' + e.getMessage());
            throw new AuraHandledException(
                'Unable to load signal configuration. (' + e.getMessage() + ')');
        }
    }

    // ── PUT /v1/user/signals/config ─────────────────────────────────────────
    @AuraEnabled
    public static String saveSignalsConfig(String configJson) {
        if (String.isBlank(configJson)) {
            throw new AuraHandledException('configJson is required.');
        }
        String correlationId = AiNavigatorEventService.generateCorrelationId();
        String userId        = UserInfo.getUserId();
        try {
            Map<String, Object> azurePayload = flattenToAzureFlags(configJson);
            String              requestBody  = JSON.serialize(azurePayload);

            HttpRequest req = AzureHttpService.buildRequest('PUT', CONFIG_PATH, correlationId, userId);
            req.setBody(requestBody);

            HttpResponse res = new Http().send(req);
            logRequest('PUT', requestBody, res, correlationId);

            if (res.getStatusCode() == 200) {
                return JSON.serialize(new Map<String, Object>{
                    'success'       => true,
                    'correlationId' => correlationId
                });
            }

            String errMsg = AzureHttpService.parseErrorResponse(res);
            throw new AuraHandledException('Azure error saving signal config: ' + errMsg);

        } catch (AzureHttpService.AzureHttpServiceException configEx) {
            throw new AuraHandledException(configEx.getMessage());
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'SignalsConfigController.saveSignalsConfig – ' + e.getMessage());
            throw new AuraHandledException(
                'Unable to save signal configuration. (' + e.getMessage() + ')');
        }
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private static List<Map<String, Object>> buildCategories(Map<String, Object> azureFlags) {
        Map<String, Map<String, Object>>       catMeta    = new Map<String, Map<String, Object>>();
        Map<String, List<Map<String, Object>>> catSignals = new Map<String, List<Map<String, Object>>>();
        List<String>                           orderedIds = new List<String>();

        for (Map<String, Object> def : SIGNAL_DEFINITIONS) {
            String catId = (String) def.get('categoryId');

            if (!catMeta.containsKey(catId)) {
                orderedIds.add(catId);
                catMeta.put(catId, new Map<String, Object>{
                    'categoryId'    => catId,
                    'label'         => def.get('label'),
                    'priorityLevel' => def.get('priorityLevel')
                });
                catSignals.put(catId, new List<Map<String, Object>>());
            }

            String  azureKey = (String) def.get('azureKey');
            Boolean enabled  = azureFlags.containsKey(azureKey)
                               ? (Boolean) azureFlags.get(azureKey)
                               : true;

            catSignals.get(catId).add(new Map<String, Object>{
                'id'          => def.get('id'),
                'name'        => def.get('name'),
                'description' => def.get('description'),
                'priority'    => def.get('priority'),
                'timeframe'   => def.get('timeframe'),
                'enabled'     => enabled,
                'azureKey'    => azureKey
            });
        }

        List<Map<String, Object>> categories = new List<Map<String, Object>>();
        for (String catId : orderedIds) {
            Map<String, Object> cat = catMeta.get(catId);
            cat.put('signals', catSignals.get(catId));
            categories.add(cat);
        }
        return categories;
    }

    private static Map<String, Object> flattenToAzureFlags(String categoriesJson) {
        List<Object>        categories = (List<Object>) JSON.deserializeUntyped(categoriesJson);
        Map<String, Object> flags      = new Map<String, Object>();
        for (Object catObj : categories) {
            Map<String, Object> cat     = (Map<String, Object>) catObj;
            List<Object>        signals = (List<Object>) cat.get('signals');
            if (signals == null) continue;
            for (Object sigObj : signals) {
                Map<String, Object> sig      = (Map<String, Object>) sigObj;
                String              azureKey = (String)  sig.get('azureKey');
                Boolean             enabled  = (Boolean) sig.get('enabled');
                if (String.isNotBlank(azureKey)) {
                    flags.put(azureKey, enabled != null ? enabled : true);
                }
            }
        }
        return flags;
    }

    private static Map<String, Object> parseBody(String body) {
        if (String.isBlank(body)) return new Map<String, Object>();
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(body);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'SignalsConfigController.parseBody – ' + e.getMessage());
            return new Map<String, Object>();
        }
    }

    private static void logRequest(
        String method,
        String requestBody,
        HttpResponse res,
        String correlationId
    ) {
        try {
            Boolean success = res.getStatusCode() >= 200 && res.getStatusCode() < 300;
            Azure_Request_Log__c logRecord = new Azure_Request_Log__c();
            logRecord.HTTP_Method__c      = method;
            logRecord.Endpoint_Name__c    = 'SignalsConfigController.' + method;
            logRecord.Request_Body__c     = requestBody;
            logRecord.Response_Body__c    = res.getBody();
            logRecord.Status__c          = success ? 'Success' : 'Failed';
            logRecord.HTTP_Status_Code__c  = res.getStatusCode();
            logRecord.Correlation_ID__c   = correlationId;
            logRecord.Error_Message__c    = success ? null : ('HTTP ' + res.getStatusCode());
            insert logRecord;
        } catch (Exception logEx) {
            System.debug(LoggingLevel.ERROR,
                'SignalsConfigController – log write failed: ' + logEx.getMessage());
        }
    }
}

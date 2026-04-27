/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-27-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class SignalsConfigController {

    @AuraEnabled(cacheable=true)
    public static String getSignalsConfig() {
        List<Map<String, Object>> categories = new List<Map<String, Object>>();

        // ── Capital Events (P5 - Critical) ──
        categories.add(new Map<String, Object>{
            'categoryId'   => 'capital-events',
            'label'        => 'Capital Events',
            'priorityLevel'=> 5,
            'signals'      => new List<Map<String, Object>>{
                new Map<String, Object>{ 'id'=>'ce-1', 'name'=>'Capital Event or Imminent Capital Need',      'description'=>'Acquisition language, CapEx acceleration, facility expansion, debt maturity within 12 months', 'priority'=>'P5', 'timeframe'=>'Immediate', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'ce-2', 'name'=>'Ownership Change or New Financial Investor', 'description'=>'PE acquisition, minority investment, strategic investor, board changes tied to ownership',           'priority'=>'P5', 'timeframe'=>'Immediate', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'ce-3', 'name'=>'M&A Announcement (Buyer or Target)',         'description'=>'Company announced as acquisition target or acquirer',                                           'priority'=>'P5', 'timeframe'=>'Immediate', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'ce-4', 'name'=>'PE or Sponsor Involvement',                 'description'=>'Private equity or financial sponsor takes stake or increases involvement',                     'priority'=>'P5', 'timeframe'=>'Immediate', 'enabled'=>true }
            }
        });

        // ── Bank Strain (P4 - High) ──
        categories.add(new Map<String, Object>{
            'categoryId'   => 'bank-strain',
            'label'        => 'Bank Strain',
            'priorityLevel'=> 4,
            'signals'      => new List<Map<String, Object>>{
                new Map<String, Object>{ 'id'=>'bs-1', 'name'=>'Bank Relationship Disruption',    'description'=>'Lost banking relationship, banker departure, or bank merger affecting the company',   'priority'=>'P4', 'timeframe'=>'Immediate', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'bs-2', 'name'=>'Credit Facility Change',          'description'=>'Revolver renewal, credit line reduction, covenant waiver, or new lender announced',  'priority'=>'P4', 'timeframe'=>'Immediate', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'bs-3', 'name'=>'Refinancing or Debt Restructure', 'description'=>'Refinancing existing debt, new term loan, or restructuring balance sheet',            'priority'=>'P4', 'timeframe'=>'Near-term', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'bs-4', 'name'=>'Financial Distress Signals',      'description'=>'Layoffs, facility closures, restructuring charges, or credit downgrade',              'priority'=>'P4', 'timeframe'=>'Near-term', 'enabled'=>false }
            }
        });

        // ── Risk Review (P3 - Medium) ──
        categories.add(new Map<String, Object>{
            'categoryId'   => 'risk-review',
            'label'        => 'Risk Review',
            'priorityLevel'=> 3,
            'signals'      => new List<Map<String, Object>>{
                new Map<String, Object>{ 'id'=>'rr-1', 'name'=>'Regulatory Action or Investigation', 'description'=>'SEC filing, regulatory fine, government investigation, or compliance issue',       'priority'=>'P3', 'timeframe'=>'Immediate', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'rr-2', 'name'=>'Litigation or Legal Risk',           'description'=>'Major lawsuit filed, class action, or significant legal settlement announced',     'priority'=>'P3', 'timeframe'=>'Near-term', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'rr-3', 'name'=>'Leadership Transition Risk',         'description'=>'CEO/CFO departure without clear succession, board changes signaling instability',  'priority'=>'P3', 'timeframe'=>'Near-term', 'enabled'=>true },
                new Map<String, Object>{ 'id'=>'rr-4', 'name'=>'Cybersecurity or Operational Risk',  'description'=>'Data breach, major operational failure, or significant IT disruption announced',   'priority'=>'P3', 'timeframe'=>'Near-term', 'enabled'=>false }
            }
        });

        // ── Strategic Direction (P2 - Low) ──
        categories.add(new Map<String, Object>{
            'categoryId'   => 'strategic-direction',
            'label'        => 'Strategic Direction',
            'priorityLevel'=> 2,
            'signals'      => new List<Map<String, Object>>{
                new Map<String, Object>{ 'id'=>'sd-1', 'name'=>'New Market Entry or Expansion',       'description'=>'Entering new geographic markets, product lines, or customer segments',              'priority'=>'P2', 'timeframe'=>'Near-term',  'enabled'=>true },
                new Map<String, Object>{ 'id'=>'sd-2', 'name'=>'Strategic Partnership Announced',     'description'=>'Joint venture, strategic alliance, or distribution partnership announced',          'priority'=>'P2', 'timeframe'=>'Near-term',  'enabled'=>true },
                new Map<String, Object>{ 'id'=>'sd-3', 'name'=>'Significant Hiring or Headcount Push','description'=>'Major hiring initiative, new facility, or significant headcount expansion',         'priority'=>'P2', 'timeframe'=>'Long-term',  'enabled'=>true },
                new Map<String, Object>{ 'id'=>'sd-4', 'name'=>'Technology Investment or Upgrade',    'description'=>'Large ERP, infrastructure, or digital transformation investment announced',         'priority'=>'P2', 'timeframe'=>'Long-term',  'enabled'=>false }
            }
        });

        // ── Informational (P1) ──
        categories.add(new Map<String, Object>{
            'categoryId'   => 'informational',
            'label'        => 'Informational',
            'priorityLevel'=> 1,
            'signals'      => new List<Map<String, Object>>{
                new Map<String, Object>{ 'id'=>'in-1', 'name'=>'Industry Award or Recognition',   'description'=>'Company wins industry award, joins association, or earns notable recognition',    'priority'=>'P1', 'timeframe'=>'Long-term',  'enabled'=>true },
                new Map<String, Object>{ 'id'=>'in-2', 'name'=>'Community or ESG Initiative',     'description'=>'Sustainability pledge, community investment, or ESG report released',             'priority'=>'P1', 'timeframe'=>'Long-term',  'enabled'=>true },
                new Map<String, Object>{ 'id'=>'in-3', 'name'=>'Executive Speaking Engagement',   'description'=>'CEO or executive keynote, conference appearance, or major media interview',       'priority'=>'P1', 'timeframe'=>'Long-term',  'enabled'=>false },
                new Map<String, Object>{ 'id'=>'in-4', 'name'=>'New Product or Service Launch',   'description'=>'Product launch, new service offering, or major product update announced',        'priority'=>'P1', 'timeframe'=>'Long-term',  'enabled'=>true }
            }
        });

        return JSON.serialize(categories);
    }
}
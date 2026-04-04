/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-27-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class MockDataProvider {

    // ─── Dashboard Stats ───────────────────────────────────────────────
    public static Map<String, Object> getDashboardStats() {
        return new Map<String, Object>{
            'totalCompanies' => 5,
            'processing'     => 1,
            'completed'      => 3,
            'opened'         => 1
        };
    }

    // ─── Companies List ────────────────────────────────────────────────
    public static List<Map<String, Object>> getCompanies() {
        List<Map<String, Object>> companies = new List<Map<String, Object>>();

        companies.add(new Map<String, Object>{
            'companyId'  => 'co-001',
            'name'       => 'Acme Manufacturing Co.',
            'city'       => 'Milwaukee',
            'state'      => 'WI',
            'website'    => 'https://www.acmemfg.com',
            'status'     => 'completed',
            'stage'      => 'PreCall',
            'clientType' => 'Prospect',
            'createdAt'  => '2026-03-20T14:30:00Z'
        });

        companies.add(new Map<String, Object>{
            'companyId'  => 'co-002',
            'name'       => 'Summit Logistics LLC',
            'city'       => 'Chicago',
            'state'      => 'IL',
            'website'    => 'https://www.summitlogistics.com',
            'status'     => 'completed',
            'stage'      => 'Appointment Set',
            'clientType' => 'Existing Customer',
            'createdAt'  => '2026-03-18T09:15:00Z'
        });

        companies.add(new Map<String, Object>{
            'companyId'  => 'co-003',
            'name'       => 'Riverstone Construction',
            'city'       => 'Indianapolis',
            'state'      => 'IN',
            'website'    => 'https://www.riverstoneconstruction.com',
            'status'     => 'processing',
            'stage'      => 'PreCall',
            'clientType' => 'Prospect',
            'createdAt'  => '2026-03-24T08:00:00Z'
        });

        companies.add(new Map<String, Object>{
            'companyId'  => 'co-004',
            'name'       => 'Keystone Medical Supplies',
            'city'       => 'Columbus',
            'state'      => 'OH',
            'website'    => 'https://www.keystonemed.com',
            'status'     => 'completed',
            'stage'      => 'Face To Face',
            'clientType' => 'Past Customer',
            'createdAt'  => '2026-03-15T11:45:00Z'
        });

        companies.add(new Map<String, Object>{
            'companyId'  => 'co-005',
            'name'       => 'BlueSky Technology Group',
            'city'       => 'Minneapolis',
            'state'      => 'MN',
            'website'    => 'https://www.blueskytechgroup.com',
            'status'     => 'completed',
            'stage'      => 'Qualification',
            'clientType' => 'Prospect',
            'createdAt'  => '2026-03-10T16:20:00Z'
        });

        return companies;
    }

    // ─── Signals for a Company ─────────────────────────────────────────
    public static List<Map<String, Object>> getSignals(String companyId) {
        List<Map<String, Object>> signals = new List<Map<String, Object>>();

        if (companyId == 'comp-001') {
            signals.add(new Map<String, Object>{
                'signalType'        => 'Opportunity',
                'signalCategory'    => 'Capital',
                'signalName'        => 'Series B Funding Round Announced',
                'signalDescription' => 'Acme Manufacturing has announced a $12M Series B funding round to expand production capacity and enter two new regional markets.',
                'keyIndicators'     => new List<String>{'$12M raise', 'New equipment purchases expected', 'Hiring 40+ staff'},
                'suggestedActions'  => 'Schedule a meeting to discuss equipment financing and working capital credit line before funds are deployed.',
                'confidence'        => 'High',
                'timeframe'         => 'Immediate',
                'sourceUrls'        => new List<String>{'https://www.businesswire.com/acme-series-b'},
                'date'              => '2026-03-15',
                'eventDate'         => '2026-03-15'
            });
            signals.add(new Map<String, Object>{
                'signalType'        => 'Early Warning',
                'signalCategory'    => 'Leadership',
                'signalName'        => 'CFO Departure Announced',
                'signalDescription' => 'The incumbent CFO has announced resignation effective April 30, 2026. An interim CFO has been named.',
                'keyIndicators'     => new List<String>{'Interim CFO appointed', 'Financial strategy review likely', 'Banking relationships may be reconsidered'},
                'suggestedActions'  => 'Reach out to the interim CFO promptly to establish a relationship before permanent hire.',
                'confidence'        => 'High',
                'timeframe'         => 'Near-term',
                'sourceUrls'        => new List<String>{'https://www.linkedin.com/company/acmemfg'},
                'date'              => '2026-03-18',
                'eventDate'         => '2026-03-18'
            });
        }

        if (companyId == 'comp-002') {
            signals.add(new Map<String, Object>{
                'signalType'        => 'Opportunity',
                'signalCategory'    => 'Expansion',
                'signalName'        => 'New Distribution Center Opening',
                'signalDescription' => 'Summit Logistics is opening a 200,000 sq ft distribution center in the Memphis, TN corridor to support Southeast expansion.',
                'keyIndicators'     => new List<String>{'Real estate acquisition', 'Fleet expansion', '$8M capex planned'},
                'suggestedActions'  => 'Discuss construction financing and fleet/equipment loan options given the planned capex.',
                'confidence'        => 'Medium',
                'timeframe'         => 'Short-term',
                'sourceUrls'        => new List<String>{'https://www.summitlogistics.com/news'},
                'date'              => '2026-03-10',
                'eventDate'         => '2026-03-10'
            });
        }

        if (companyId == 'comp-004') {
            signals.add(new Map<String, Object>{
                'signalType'        => 'Early Warning',
                'signalCategory'    => 'Risk',
                'signalName'        => 'Supply Chain Disruption Risk',
                'signalDescription' => 'Keystone Medical Supplies is facing supply chain disruptions from overseas manufacturers, which may affect cash flow and inventory levels in Q2 2026.',
                'keyIndicators'     => new List<String>{'Inventory shortfall risk', 'Delayed receivables', 'Working capital strain'},
                'suggestedActions'  => 'Proactively discuss a working capital line of credit or inventory financing facility.',
                'confidence'        => 'Medium',
                'timeframe'         => 'Short-term',
                'sourceUrls'        => new List<String>{},
                'date'              => '2026-03-20',
                'eventDate'         => '2026-03-20'
            });
        }

        if (companyId == 'comp-005') {
            signals.add(new Map<String, Object>{
                'signalType'        => 'Opportunity',
                'signalCategory'    => 'Strategic',
                'signalName'        => 'Government Contract Award',
                'signalDescription' => 'BlueSky Technology Group was awarded a $5M state government IT contract, significantly increasing their revenue backlog.',
                'keyIndicators'     => new List<String>{'$5M contract', 'Hiring 15 engineers', 'Office expansion expected'},
                'suggestedActions'  => 'Discuss a credit facility to support contract ramp-up costs and office lease financing.',
                'confidence'        => 'High',
                'timeframe'         => 'Immediate',
                'sourceUrls'        => new List<String>{'https://www.mn.gov/contracts/bluesky'},
                'date'              => '2026-03-05',
                'eventDate'         => '2026-03-05'
            });
        }

        return signals;
    }

    // ─── Company Info (for Call Plan Modal) ────────────────────────────
    public static Map<String, Object> getCompanyInfo(String companyId) {
        Map<String, Object> info = new Map<String, Object>{
            'companyId' => companyId
        };

        if (companyId == 'comp-001') {
            info.put('name', 'Acme Manufacturing Co.');
            info.put('timeInBusiness', '22 years');
            info.put('entityType', 'S-Corporation');
            info.put('headquarterAddress', 'Milwaukee, WI');
            info.put('industryAndBusinessModel', 'Industrial parts manufacturing with distribution across the Midwest. Serves automotive OEMs and tier-1 suppliers.');
            info.put('serviceAreas', new List<String>{'Wisconsin', 'Illinois', 'Michigan', 'Indiana'});
            info.put('numberOfEmployees', '185');
            info.put('annualRevenue', '$28M');
            info.put('website', 'https://www.acmemfg.com');
        } else if (companyId == 'comp-002') {
            info.put('name', 'Summit Logistics LLC');
            info.put('timeInBusiness', '11 years');
            info.put('entityType', 'LLC');
            info.put('headquarterAddress', 'Chicago, IL');
            info.put('industryAndBusinessModel', 'Third-party logistics and warehousing for retail and e-commerce clients across the Midwest and Southeast.');
            info.put('serviceAreas', new List<String>{'Illinois', 'Tennessee', 'Ohio', 'Kentucky'});
            info.put('numberOfEmployees', '320');
            info.put('annualRevenue', '$45M');
            info.put('website', 'https://www.summitlogistics.com');
        } else if (companyId == 'comp-004') {
            info.put('name', 'Keystone Medical Supplies');
            info.put('timeInBusiness', '17 years');
            info.put('entityType', 'C-Corporation');
            info.put('headquarterAddress', 'Columbus, OH');
            info.put('industryAndBusinessModel', 'Distributor of medical supplies and PPE to hospitals, clinics, and long-term care facilities across the Midwest.');
            info.put('serviceAreas', new List<String>{'Ohio', 'Pennsylvania', 'Indiana', 'Kentucky'});
            info.put('numberOfEmployees', '95');
            info.put('annualRevenue', '$18M');
            info.put('website', 'https://www.keystonemed.com');
        } else if (companyId == 'comp-005') {
            info.put('name', 'BlueSky Technology Group');
            info.put('timeInBusiness', '8 years');
            info.put('entityType', 'S-Corporation');
            info.put('headquarterAddress', 'Minneapolis, MN');
            info.put('industryAndBusinessModel', 'IT managed services and government technology solutions provider specializing in cloud infrastructure and cybersecurity.');
            info.put('serviceAreas', new List<String>{'Minnesota', 'Wisconsin', 'Iowa'});
            info.put('numberOfEmployees', '62');
            info.put('annualRevenue', '$9M');
            info.put('website', 'https://www.blueskytechgroup.com');
        } else {
            info.put('name', 'Unknown Company');
        }

        return info;
    }
        // ─── Call Plans for a Company ──────────────────────────────────────
    public static Map<String, Object> getCallPlan(String companyId) {
        List<Map<String, Object>> callPlans = new List<Map<String, Object>>();
        String companyName = 'Unknown Company';
        String overallStrategy = '';

        if (companyId == 'comp-001') {
            companyName = 'Acme Manufacturing Co.';
            overallStrategy = 'Lead with the funding round as the primary opportunity. Position the bank as a strategic financial partner for their growth phase, not just a transactional lender.';
            callPlans.add(new Map<String, Object>{
                'signalName'          => 'Series B Funding Round Announced',
                'signalPriority'      => 5,
                'insight'             => 'Acme has announced a $12M Series B raise earmarked for equipment and market expansion. This capital event creates an immediate window for equipment financing, working capital lines, and treasury services before funds are deployed elsewhere.',
                'callObjective'       => 'Secure a meeting with the CFO or interim financial decision-maker to position a comprehensive credit facility covering equipment financing and working capital.',
                'openingStatement'    => 'Congratulations on the Series B — that\'s a significant milestone for Acme. We\'ve been following your growth closely and I\'d love to share how we\'ve helped similar manufacturers maximize their capital deployment efficiency during expansion phases.',
                'discoveryQuestions'  => new List<String>{
                    'What is the timeline for deploying the Series B capital into equipment purchases?',
                    'Are you evaluating equipment leasing vs. purchasing for the new production capacity?',
                    'How are you currently managing your working capital cycle as you scale?',
                    'Is treasury management and cash flow optimization something your team is actively reviewing?'
                }
            });
            callPlans.add(new Map<String, Object>{
                'signalName'          => 'CFO Departure Announced',
                'signalPriority'      => 4,
                'insight'             => 'The incumbent CFO is departing April 30. An interim CFO has been named. Leadership transitions at the CFO level often trigger a review of banking relationships and financial strategy — this is a critical window to establish a new relationship.',
                'callObjective'       => 'Connect with the interim CFO before a permanent hire is made to establish a relationship and position the bank as the preferred financial partner.',
                'openingStatement'    => 'I understand you\'re in a transition period with your finance leadership. I wanted to reach out now — before things get hectic — to introduce myself and make sure you\'re aware of the full range of services we can bring to Acme.',
                'discoveryQuestions'  => new List<String>{
                    'As you step into the interim role, what are your top financial priorities for Q2?',
                    'Is a review of your current banking relationships on the agenda during the transition?',
                    'What gaps in financial tools or reporting would make your role easier right now?',
                    'When do you expect a permanent CFO to be named?'
                }
            });
        } else if (companyId == 'comp-002') {
            companyName = 'Summit Logistics LLC';
            overallStrategy = 'Lead with real estate and construction financing for the Memphis distribution center. Position the bank as the go-to lender for their Southeast expansion.';
            callPlans.add(new Map<String, Object>{
                'signalName'          => 'New Distribution Center Opening',
                'signalPriority'      => 2,
                'insight'             => 'Summit is opening a 200,000 sq ft distribution center in Memphis with $8M capex planned. This creates opportunities for construction financing, equipment loans, and a larger working capital facility to support the operational ramp-up.',
                'callObjective'       => 'Schedule a meeting to discuss construction/real estate financing for the Memphis facility and fleet expansion loans.',
                'openingStatement'    => 'I saw the announcement about your Memphis expansion — that\'s a bold move into the Southeast. We\'ve financed several distribution facility builds of this scale and I think there\'s a real opportunity to structure something that works well for Summit\'s cash flow.',
                'discoveryQuestions'  => new List<String>{
                    'Have you secured financing for the Memphis facility construction yet?',
                    'Are you planning to expand your fleet to service the new distribution corridor?',
                    'How are you thinking about the working capital needs during the ramp-up period?',
                    'Is there flexibility in your timeline that would allow us to structure a phased financing plan?'
                }
            });
        } else if (companyId == 'comp-004') {
            companyName = 'Keystone Medical Supplies';
            overallStrategy = 'Lead with empathy around the supply chain disruption. Position a working capital line as a defensive tool to protect their cash flow and avoid inventory shortfalls.';
            callPlans.add(new Map<String, Object>{
                'signalName'          => 'Supply Chain Disruption Risk',
                'signalPriority'      => 3,
                'insight'             => 'Keystone is facing overseas supply chain disruptions that threaten Q2 cash flow and inventory levels. A proactive working capital line or inventory financing facility can serve as a buffer, preventing a liquidity crisis before it materializes.',
                'callObjective'       => 'Position a working capital line of credit as an immediate protective measure against the supply chain disruption impacting Q2.',
                'openingStatement'    => 'We\'ve been paying close attention to the supply chain challenges hitting medical distributors right now. I wanted to reach out proactively — many of our clients in similar situations have found a flexible working capital facility gives them the buffer they need to navigate without disrupting operations.',
                'discoveryQuestions'  => new List<String>{
                    'How significant is the inventory shortfall risk you\'re facing going into Q2?',
                    'Do you currently have a working capital line of credit in place?',
                    'How long do you estimate the supply disruption will impact your receivables cycle?',
                    'Are you exploring domestic supplier alternatives that might require upfront capital?'
                }
            });
        } else if (companyId == 'comp-005') {
            companyName = 'BlueSky Technology Group';
            overallStrategy = 'Lead with the government contract win as a growth catalyst. Position a credit facility as the smart way to fund the ramp-up without diluting equity or straining cash flow.';
            callPlans.add(new Map<String, Object>{
                'signalName'          => 'Government Contract Award',
                'signalPriority'      => 2,
                'insight'             => 'BlueSky was awarded a $5M state government IT contract. Government contracts often have slow payment cycles (net 60-90 days) while requiring upfront hiring and infrastructure costs — creating a classic working capital gap that a credit facility can bridge efficiently.',
                'callObjective'       => 'Offer a credit facility to bridge the working capital gap between contract ramp-up costs and government payment cycles.',
                'openingStatement'    => 'Congratulations on the state contract — that\'s a major win for BlueSky. We work with a number of government IT contractors and one pattern we see consistently is a cash flow timing gap during ramp-up. I\'d love to share how we\'ve helped similar firms manage that gap without slowing their execution.',
                'discoveryQuestions'  => new List<String>{
                    'What is the payment cycle on the government contract — net 30, 60, or longer?',
                    'How quickly do you need to hire and onboard the 15 engineers to meet the contract timeline?',
                    'Are you planning to expand your office space to accommodate the new team?',
                    'Do you have an existing credit facility, or would this be a new banking relationship?'
                }
            });
        }

        return new Map<String, Object>{
            'success'         => true,
            'companyId'       => companyId,
            'companyName'     => companyName,
            'generatedAt'     => String.valueOf(DateTime.now()),
            'overallStrategy' => overallStrategy,
            'callPlans'       => callPlans
        };
    }
}
/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-27-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class CompanyDetailController {

    // ── Company header data ──
    @AuraEnabled
    public static String getCompany(String companyId) {
        if (String.isBlank(companyId)) companyId = 'co-001';
        List<Map<String, Object>> companies = getMockCompanies();
        for (Map<String, Object> c : companies) {
            if (c.get('id') == companyId || c.get('companyId') == companyId) {
                return JSON.serialize(c);
            }
        }
        return JSON.serialize(companies[0]); // fallback
    }

    // ── All companies (for dashboard navigation) ──
    @AuraEnabled(cacheable=true)
    public static String getAllCompanies() {
        return JSON.serialize(getMockCompanies());
    }

    // ── Live Updates ──
    @AuraEnabled
    public static String getLiveUpdates(String companyId) {
        if (String.isBlank(companyId)) companyId = 'co-001'; // safe fallback

        List<Map<String, Object>> sections = new List<Map<String, Object>>();
        sections.add(buildUpdateSection('companyleadership', 'Company & Leadership', companyId));
        sections.add(buildUpdateSection('industrymarket',    'Industry & Market',    companyId));
        sections.add(buildUpdateSection('financiallegal',    'Financial & Legal',    companyId));
        sections.add(buildUpdateSection('regulatory',        'Regulatory',           companyId));
        return JSON.serialize(sections);
    }

    // ── Signals ──
    @AuraEnabled(cacheable=true)
    public static String getSignals(String companyId) {
        List<Map<String, Object>> signals = new List<Map<String, Object>>{
            new Map<String, Object>{
                'id'              => 's1',
                'signalName'      => 'PE Acquisition Interest',
                'signalDescription'=> 'Private equity sponsor actively evaluating acquisition in this sector.',
                'signalCategory'  => 'Capital Events',
                'signalType'      => 'Opportunity',
                'priority'        => 'P5',
                'eventDate'       => '2026-03-20',
                'impact'          => 'High'
            },
            new Map<String, Object>{
                'id'              => 's2',
                'signalName'      => 'CFO Departure',
                'signalDescription'=> 'Chief Financial Officer announced departure effective next quarter.',
                'signalCategory'  => 'Leadership Changes',
                'signalType'      => 'Early Warning',
                'priority'        => 'P4',
                'eventDate'       => '2026-03-15',
                'impact'          => 'High'
            },
            new Map<String, Object>{
                'id'              => 's3',
                'signalName'      => 'Credit Facility Renewal',
                'signalDescription'=> 'Existing revolving credit line matures within 12 months; renewal likely.',
                'signalCategory'  => 'Bank Strain',
                'signalType'      => 'Opportunity',
                'priority'        => 'P4',
                'eventDate'       => '2026-03-10',
                'impact'          => 'Medium'
            },
            new Map<String, Object>{
                'id'              => 's4',
                'signalName'      => 'Regulatory Investigation',
                'signalDescription'=> 'State regulatory body opened compliance review of billing practices.',
                'signalCategory'  => 'Risk Signals',
                'signalType'      => 'Early Warning',
                'priority'        => 'P3',
                'eventDate'       => '2026-02-28',
                'impact'          => 'Medium'
            },
            new Map<String, Object>{
                'id'              => 's5',
                'signalName'      => 'New Market Expansion',
                'signalDescription'=> 'Company announced entry into two new geographic markets this quarter.',
                'signalCategory'  => 'Strategic Changes',
                'signalType'      => 'Opportunity',
                'priority'        => 'P2',
                'eventDate'       => '2026-02-14',
                'impact'          => 'Low'
            }
        };
        return JSON.serialize(new Map<String, Object>{ 'signals' => signals });
    }

    // ── Private helpers ──
    private static List<Map<String, Object>> getMockCompanies() {
        return new List<Map<String, Object>>{
            new Map<String, Object>{ 'id'=>'co-001', 'companyId'=>'co-001', 'name'=>'Acme Manufacturing Co.',    'city'=>'Milwaukee',   'state'=>'WI', 'website'=>'https://www.acmemfg.com',               'status'=>'completed',  'updatedAt'=>'2026-03-20' },
            new Map<String, Object>{ 'id'=>'co-002', 'companyId'=>'co-002', 'name'=>'BlueSky Technology Group',  'city'=>'Minneapolis',  'state'=>'MN', 'website'=>'https://www.blueskytechgroup.com',       'status'=>'completed',  'updatedAt'=>'2026-03-10' },
            new Map<String, Object>{ 'id'=>'co-003', 'companyId'=>'co-003', 'name'=>'Keystone Medical Supplies', 'city'=>'Columbus',     'state'=>'OH', 'website'=>'https://www.keystonemed.com',            'status'=>'completed',  'updatedAt'=>'2026-03-15' },
            new Map<String, Object>{ 'id'=>'co-004', 'companyId'=>'co-004', 'name'=>'Riverstone Construction',   'city'=>'Indianapolis', 'state'=>'IN', 'website'=>'https://www.riverstoneconstruction.com', 'status'=>'processing', 'updatedAt'=>'2026-03-24' },
            new Map<String, Object>{ 'id'=>'co-005', 'companyId'=>'co-005', 'name'=>'Summit Logistics LLC',      'city'=>'Chicago',      'state'=>'IL', 'website'=>'https://www.summitlogistics.com',        'status'=>'completed',  'updatedAt'=>'2026-03-18' }
        };
    }

    private static Map<String, Object> buildUpdateSection(String sectionType, String sectionName, String companyId) {
        List<Map<String, Object>> updates = new List<Map<String, Object>>{
            new Map<String, Object>{
                'category'  => 'Growth Signal',
                'headline' => sectionName + ' — Key development identified',
                'summary'   => 'This company has demonstrated strong momentum in this area based on recent market activity, partnerships, and financial disclosures reviewed from public sources.',
                'date'      => '2026-03-15',
                'source'    => 'Manta.com',
                'sourceUrl' => 'https://www.manta.com',
                'impact'    => 'Medium'
            },
            new Map<String, Object>{
                'category'  => 'Executive Intel',
                'headline'  => 'Leadership update: key executive decision noted',
                'summary'   => 'Recent executive activity suggests strategic repositioning. The primary contact remains the owner and key decision maker for banking relationships.',
                'date'      => '2026-02-20',
                'source'    => 'BBB Profile',
                'sourceUrl' => 'https://www.bbb.org',
                'impact'    => 'Medium'
            },
            new Map<String, Object>{
                'category'  => 'Challenge',
                'headline'  => 'Operational constraint identified',
                'summary'   => 'Small-scale operations with limited revenue may restrict access to traditional credit structures. Specialised banking solutions recommended.',
                'date'      => '2026-01-10',
                'source'    => 'Company Website',
                'sourceUrl' => 'https://example.com',
                'impact'    => 'Low'
            }
        };
        return new Map<String, Object>{
            'sectionType' => sectionType,
            'sectionName' => sectionName,
            'content'     => new Map<String, Object>{ 'updates' => updates }
        };
    }
    @AuraEnabled(cacheable=true)
    public static String getAiResearch(String companyId) {
        Map<String, Object> research = new Map<String, Object>{
            'company' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'description'    => 'Acme Manufacturing Co. is a mid-market precision parts manufacturer serving the automotive and aerospace sectors. Founded in 1987, the company operates two facilities in the Milwaukee metro area with approximately 280 employees.',
                    'revenue'        => '$42M',
                    'employees'      => '280',
                    'founded'        => '1987',
                    'headquarters'   => 'Milwaukee, WI',
                    'products'       => 'Precision machined components, custom fabrication, quality inspection services',
                    'businessModel'  => 'B2B contract manufacturer with long-term OEM supply agreements',
                    'naicsCode'      => '332710'
                }
            },
            'industry' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'industry'       => 'Precision Manufacturing',
                    'marketSize'     => '$285B (US)',
                    'growthRate'     => '3.8% CAGR',
                    'keyTrends'      => 'Reshoring of domestic production, automation adoption, supply chain diversification post-COVID',
                    'competitors'    => 'Lincoln Industries, Metal Technologies, Precision Castparts',
                    'outlook'        => 'Positive — driven by aerospace recovery and EV component demand'
                }
            },
            'targetcustomer' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'primaryBuyer'   => 'VP of Supply Chain / Procurement Director at Tier-1 automotive OEMs',
                    'decisionMakers' => 'CFO, COO, Plant Manager',
                    'painPoints'     => 'On-time delivery reliability, quality certifications (IATF 16949), cost pressure from OEMs',
                    'buyingCycle'    => '6–18 months for new supplier qualification'
                }
            },
            'ecosystempartnerships' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'keyPartners'    => 'Tier-1 automotive OEMs, Boeing supply chain, local tooling vendors',
                    'certifications' => 'ISO 9001:2015, IATF 16949, AS9100D',
                    'associations'   => 'Precision Metalforming Association, NTMA',
                    'bankingNeeds'   => 'Equipment financing, revolving credit for raw materials, international wire capabilities'
                }
            },
            'leadership' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'leaders' => new List<Object>{
                        new Map<String, Object>{ 'fullName'=>'James R. Kowalski', 'title'=>'CEO / Owner',           'background'=>'Founded the company in 1987. 35+ years in precision manufacturing. Holds majority ownership stake.' },
                        new Map<String, Object>{ 'fullName'=>'Sandra Tran',       'title'=>'CFO',                   'background'=>'CPA with 18 years in manufacturing finance. Joined in 2019. Oversees banking relationships and capital planning.' },
                        new Map<String, Object>{ 'fullName'=>'Derek Mills',        'title'=>'VP of Operations',      'background'=>'20 years on the plant floor. Oversees both facilities and all production scheduling.' },
                        new Map<String, Object>{ 'fullName'=>'Angela Reyes',       'title'=>'Director of Sales',     'background'=>'Manages OEM account relationships. Previously at Lincoln Industries for 10 years.' }
                    }
                }
            },
            'strategicintelligence' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'fields' => new List<Object>{
                        new Map<String, Object>{ 'fieldName'=>'Growth Strategy',       'data'=>'Expanding aerospace vertical to reduce auto-sector concentration. Evaluating a third facility in Q3 2026.' },
                        new Map<String, Object>{ 'fieldName'=>'Capital Needs',         'data'=>'Likely need for $8–12M equipment financing for CNC expansion. Current credit facility matures in 14 months.' },
                        new Map<String, Object>{ 'fieldName'=>'Competitive Position',  'data'=>'Top-3 supplier to two Tier-1 OEMs. Differentiated by AS9100D aerospace cert — fewer than 12% of peers hold this.' },
                        new Map<String, Object>{ 'fieldName'=>'Banking Opportunity',   'data'=>'Full relationship consolidation opportunity. Currently split across two regional banks with no treasury services.' }
                    }
                }
            },
            'financial' => new Map<String, Object>{
                'data' => new Map<String, Object>{
                    'verifiedcompanyname' => 'Acme Manufacturing Co.',
                    'verifiedcompanyurl'  => 'https://www.acmemfg.com',
                    'verificationconfidence' => 'high',
                    'fields' => new List<Object>{
                        new Map<String, Object>{ 'fieldName'=>'Annual Revenue',      'data'=>'~$42M (estimated from employee count and industry benchmarks)', 'confidence'=>'medium' },
                        new Map<String, Object>{ 'fieldName'=>'EBITDA Margin',       'data'=>'Estimated 12–16% based on precision manufacturing sector norms',  'confidence'=>'low'    },
                        new Map<String, Object>{ 'fieldName'=>'Debt Structure',      'data'=>'Existing term loan (~$3.2M) and revolving line ($2M) at First Midwest Bank', 'confidence'=>'medium' },
                        new Map<String, Object>{ 'fieldName'=>'Credit Facility',     'data'=>'$2M revolving line maturing Sept 2027. Renewal likely needed mid-2026.', 'confidence'=>'high' }
                    }
                }
            }
        };
        return JSON.serialize(research);
    }
    @AuraEnabled(cacheable=true)
    public static String getInsights(String companyId) {
        Map<String, Object> result = new Map<String, Object>{
            'discoveryCallPlan' => new Map<String, Object>{
                'companyProfile' => new Map<String, Object>{
                    'businessType'      => 'B2B Contract Manufacturer — Precision Machined Components',
                    'keyCharacteristics'=> 'Long-term OEM relationships, dual-facility operations, AS9100D certified, owner-operated'
                },
                'callStrategy' => new Map<String, Object>{
                    'primaryObjective'    => 'Understand capital structure and identify credit facility renewal opportunity',
                    'keyFocusAreas'       => new List<String>{
                        'Equipment financing needs for CNC expansion',
                        'Credit facility maturity in 14 months',
                        'Banking consolidation opportunity across two regional banks',
                        'Treasury services gap — no current cash management solution'
                    },
                    'relationshipApproach'=> 'Lead with industry knowledge (aerospace/auto convergence) to establish credibility before discussing financial solutions.',
                    'followUpActions'     => new List<String>{
                        'Send personalized recap within 24 hours',
                        'Loop in equipment finance specialist for CNC discussion',
                        'Request 3-year financials if CFO engagement is positive'
                    }
                },
                'insights' => new List<Object>{
                    new Map<String, Object>{
                        'category'          => 'Actionable',
                        'priority'          => 'High',
                        'title'             => 'Credit Facility Renewal Window Opening',
                        'rawDataTrigger'    => 'Existing $2M revolving line matures Sept 2027 — renewal discussion should begin mid-2026.',
                        'insight'           => 'With 14 months until maturity, the bank has a 60–90 day window to position before competitors engage. CFO Sandra Tran is the key contact and likely already evaluating options.',
                        'businessNeed'      => 'Revolving credit renewal + potential upsizing to fund raw material inventory growth',
                        'advisoryOpportunity'=> 'Propose a full credit facility review — include a treasury sweep account to deepen the relationship before renewal.',
                        'expectedOutcome'   => 'Full relationship consolidation with credit, treasury, and equipment finance under one roof.',
                        'discoveryQuestions'=> new List<String>{
                            'When you think about your banking relationships 12–18 months out, what does the ideal picture look like?',
                            'How are you currently managing working capital during peak production seasons?'
                        },
                        'scoring' => new Map<String, Object>{ 'recency'=>'High', 'reliability'=>'High' }
                    },
                    new Map<String, Object>{
                        'category'          => 'Strategic',
                        'priority'          => 'High',
                        'title'             => 'CNC Expansion Requires $8–12M Equipment Financing',
                        'rawDataTrigger'    => 'Q3 2026 evaluation of third facility underway. CNC capacity is the bottleneck for aerospace vertical growth.',
                        'insight'           => 'The aerospace expansion strategy requires significant capital equipment. This is a 12–18 month opportunity if engagement starts now — the CFO and CEO are both decision makers.',
                        'businessNeed'      => 'Equipment financing: 5–7 year term loan for CNC machinery, likely $8–12M range',
                        'advisoryOpportunity'=> 'Introduce equipment finance specialist. Frame around tax efficiency of structured leasing vs. term debt.',
                        'expectedOutcome'   => 'New equipment finance relationship with cross-sell into CapEx advisory.',
                        'discoveryQuestions'=> new List<String>{
                            'As you think about scaling the aerospace side of the business, what does the capital plan look like for the next 2–3 years?',
                            'Have you evaluated structured leasing vs. term debt for major equipment purchases?'
                        },
                        'scoring' => new Map<String, Object>{ 'recency'=>'High', 'reliability'=>'Medium' }
                    },
                    new Map<String, Object>{
                        'category'          => 'Relational',
                        'priority'          => 'Medium',
                        'title'             => 'Owner-Operator Dynamic — Decision Speed is High',
                        'rawDataTrigger'    => 'James Kowalski holds majority ownership and founded the business in 1987. All major decisions route through him.',
                        'insight'           => 'In owner-operated firms, trust is the primary currency. The CFO controls day-to-day banking but the owner approves any significant change in banking relationships.',
                        'businessNeed'      => 'Build dual relationship with both CFO (operational) and CEO/Owner (strategic)',
                        'advisoryOpportunity'=> 'Leverage succession and wealth planning angle with the founder — creates a deeper hook beyond credit.',
                        'expectedOutcome'   => 'Trusted advisor positioning with the owner that differentiates from transactional competitors.',
                        'discoveryQuestions'=> new List<String>{
                            'As you think about where the company goes over the next 5–10 years, what does the ownership picture look like?',
                            'How involved are you personally in major financial decisions vs. delegating to your CFO?'
                        },
                        'scoring' => new Map<String, Object>{ 'recency'=>'Medium', 'reliability'=>'High' }
                    },
                    new Map<String, Object>{
                        'category'          => 'Actionable',
                        'priority'          => 'Medium',
                        'title'             => 'Banking Split Across Two Regional Banks — Consolidation Opportunity',
                        'rawDataTrigger'    => 'Company currently split across two regional banks with no treasury services in place.',
                        'insight'           => 'A fragmented banking relationship signals either dissatisfaction or inertia. Either way, it creates an opening. No treasury services means significant low-hanging fruit.',
                        'businessNeed'      => 'Consolidated banking with treasury/cash management, ACH, and international wire capabilities',
                        'advisoryOpportunity'=> 'Lead with a treasury diagnostic — offer a no-cost cash management review to quantify savings from consolidation.',
                        'expectedOutcome'   => 'Primary bank designation with full operating accounts and treasury suite.',
                        'discoveryQuestions'=> new List<String>{
                            'How are you currently managing your operating accounts and cash positioning day-to-day?',
                            'What would it take for you to consolidate your banking to a single institution?'
                        },
                        'scoring' => new Map<String, Object>{ 'recency'=>'Medium', 'reliability'=>'Medium' }
                    }
                }
            }
        };
        return JSON.serialize(result);
    }
    @AuraEnabled(cacheable=true)
    public static String getCallPlan(String companyId) {
        Map<String, Object> result = new Map<String, Object>{
            'callPlan' => new Map<String, Object>{
                'callObjective'    => 'Conduct a discovery conversation to understand Acme Manufacturing\'s capital structure, banking relationships, and near-term financing needs — with a focus on the credit facility renewal and CNC equipment expansion.',
                'openingStatement' => 'Thank you for making the time, Sandra. I\'ve spent time looking at Acme\'s story — 35 years of growth, the aerospace certifications, the two facilities. Before I share anything about us, I\'d love to understand where the business is headed and what\'s top of mind for you heading into the second half of the year.',
                'preCallPreparation' => new List<String>{
                    'Review Acme\'s $2M revolving line maturity (Sept 2027) and existing term loan at First Midwest Bank',
                    'Study AS9100D aerospace certification — fewer than 12% of peers hold this; use as credibility opener',
                    'Note CEO James Kowalski founded in 1987 — frame around legacy, ownership, and long-term vision',
                    'Prepare equipment finance talking points for CNC expansion ($8–12M estimated)',
                    'Research Tier-1 automotive OEM supply chain dynamics for the industry context opener'
                },
                'keyTalkingPoints' => new List<String>{
                    'Full banking consolidation opportunity — no treasury services currently in place',
                    'Credit facility renewal window opening mid-2026 — 60–90 day positioning window',
                    'CNC expansion creating $8–12M equipment financing need in 2026',
                    'Aerospace vertical growth requires capital — differentiated by AS9100D cert'
                },
                'nextStepsProposal' => 'Request 3-year financial statements and schedule a follow-up with the CEO and CFO together.',
                'discoveryFramework' => new List<Object>{
                    new Map<String, Object>{
                        'step'        => '1. Build Trust & Credibility',
                        'description' => 'Establish rapport, acknowledge their story, and earn the right to ask deeper questions.',
                        'stMeyerKnowledge' => new Map<String, Object>{
                            'title'   => 'St. Meyer Hubbard — Building Trust',
                            'content' => new List<String>{
                                'Open with a genuine, specific compliment about the company or leader',
                                'Reference something earned — an award, a certification, a milestone',
                                'Slow your pace. Match their communication style before leading.',
                                'The goal is comfort, not cleverness. They must feel heard before they\'ll open up.'
                            }
                        },
                        'companyInfo' => new Map<String, Object>{
                            'title'   => 'Acme Context — Use to Build Trust',
                            'content' => new List<String>{
                                'Acme Manufacturing has operated for 35+ years under founder James Kowalski',
                                'Recently achieved AS9100D aerospace certification — a significant competitive differentiator',
                                'Expanding into aerospace vertical to reduce reliance on automotive OEMs'
                            }
                        },
                        'questions' => new List<String>{
                            'I noticed Acme recently achieved AS9100D certification — that\'s not easy to obtain. What does that open up for you on the aerospace side?',
                            'You\'ve been running this business for over 35 years — what\'s changed most about the competitive landscape in the last few years?'
                        }
                    },
                    new Map<String, Object>{
                        'step'        => '2. Frame the Discussion',
                        'description' => 'Set the agenda collaboratively and signal you\'re here to listen, not pitch.',
                        'stMeyerKnowledge' => new Map<String, Object>{
                            'title'   => 'St. Meyer Hubbard — Framing',
                            'content' => new List<String>{
                                'State the purpose of the meeting in terms of their benefit, not yours',
                                'Ask permission before sharing your agenda — "Would it be helpful if I shared what I was hoping we could cover?"',
                                'If they have limited time, let them set the priorities',
                                'Silence after framing is a good sign — they\'re thinking'
                            }
                        },
                        'companyInfo' => new Map<String, Object>{
                            'title'   => 'Acme Context — Frame Around',
                            'content' => new List<String>{
                                'Banking currently split across two regional institutions — no single relationship',
                                'No treasury services in place despite multi-facility operations',
                                'Credit facility maturity in 14 months creates natural urgency'
                            }
                        },
                        'questions' => new List<String>{
                            'I\'ve done some homework on Acme ahead of today. There are a few things I\'d love to explore with you — but I want to make sure we focus on what\'s most useful for you. What\'s most top of mind heading into the second half of the year?',
                            'If this conversation gave you one thing of real value, what would that be?'
                        }
                    },
                    new Map<String, Object>{
                        'step'        => '3. Explore Needs (GOAL Framework)',
                        'description' => 'Uncover goals, obstacles, achievements, and leverage points using open-ended discovery.',
                        'stMeyerKnowledge' => new Map<String, Object>{
                            'title'   => 'St. Meyer Hubbard — GOAL Framework',
                            'content' => new List<String>{
                                'Goals: Where are you trying to go in the next 12–24 months?',
                                'Obstacles: What\'s getting in the way?',
                                'Achievements: What have you already tried or accomplished?',
                                'Leverage: What resources or relationships could accelerate progress?'
                            }
                        },
                        'companyInfo' => new Map<String, Object>{
                            'title'   => 'Acme Context — Explore Around',
                            'content' => new List<String>{
                                'Aerospace expansion requires capital — third facility evaluation in Q3 2026',
                                'CNC capacity is the production bottleneck limiting aerospace growth',
                                'Owner-operator dynamic means capital decisions require CEO buy-in'
                            }
                        },
                        'questions' => new List<String>{
                            'As you think about the next 18–24 months — what does the capital picture need to look like to support where you\'re trying to take the business?',
                            'What\'s the biggest constraint right now between where Acme is and where you want it to be?',
                            'How are you currently thinking about funding the CNC expansion — term debt, leasing, something else?'
                        }
                    },
                    new Map<String, Object>{
                        'step'        => '4. Stories & Solutions',
                        'description' => 'Share relevant stories that connect to their situation — without pitching products.',
                        'stMeyerKnowledge' => new Map<String, Object>{
                            'title'   => 'St. Meyer Hubbard — Story Framework',
                            'content' => new List<String>{
                                'Lead with the buyer\'s situation, not your product',
                                'Use hedging language: "no two situations are exactly alike, but..."',
                                'Describe the before and after without naming specific products',
                                'End with a question that invites them to connect the story to themselves'
                            }
                        },
                        'companyInfo' => new Map<String, Object>{
                            'title'   => 'Story Angles for Acme',
                            'content' => new List<String>{
                                'Mid-market manufacturer consolidating banking at credit renewal — saved 40bps on revolving rate',
                                'Equipment financing for CNC expansion structured as 7-year term with 12-month draw period',
                                'Owner-operated firm introduced to wealth planning alongside banking consolidation'
                            }
                        },
                        'questions' => new List<String>{
                            'We\'ve worked with a few manufacturers in a similar spot — growing into aerospace, needing to scale capital without disrupting operations. Would it be useful if I shared how one of them approached the banking side of that transition?',
                            'Based on what you\'ve shared, I think there are two or three areas where we could add real value. Would it be helpful if I walked through them briefly?'
                        }
                    },
                    new Map<String, Object>{
                        'step'        => '5. Joint Commitment',
                        'description' => 'Agree on a clear next step that both sides commit to before leaving the conversation.',
                        'stMeyerKnowledge' => new Map<String, Object>{
                            'title'   => 'St. Meyer Hubbard — Closing the Loop',
                            'content' => new List<String>{
                                'Maximum goal: Obtain 3-year financials and schedule a follow-up with CEO + CFO',
                                'Minimum goal: Schedule a follow-up call with a specific date on the calendar',
                                'Always summarize what you heard before proposing next steps',
                                'Ask "What would make our next conversation even more valuable for you?"'
                            }
                        },
                        'companyInfo' => new Map<String, Object>{
                            'title'   => 'Acme Commitment Anchors',
                            'content' => new List<String>{
                                'Credit facility renewal discussion — natural urgency for follow-up',
                                'Equipment finance specialist introduction for CNC expansion',
                                'Request 3-year P&L and balance sheet to prepare a tailored proposal'
                            }
                        },
                        'questions' => new List<String>{
                            'Based on what we\'ve covered today, it sounds like the credit facility timeline and the CNC financing are the two most immediate areas. Does that match your priorities?',
                            'What would be the most useful thing I could bring to a follow-up conversation with you and James?',
                            'Can we get a date on the calendar before we wrap up today?'
                        }
                    }
                }
            }
        };
        return JSON.serialize(result);
    }
}
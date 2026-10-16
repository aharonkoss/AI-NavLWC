import { LightningElement, api, track } from 'lwc';
import getEnhancedDigestData from '@salesforce/apex/SignalDigestController.getEnhancedDigestData';

export default class EnhancedSignalDigest extends LightningElement {
    _companyId;
    _recordId;

    @api
    get companyId() {
        return this._companyId || this._recordId;
    }
    set companyId(value) {
        this._companyId = value;
        if (value) {
            this.fetchDigest();
        }
    }

    @api
    get recordId() {
        return this._recordId;
    }
    set recordId(value) {
        this._recordId = value;
        if (value && !this._companyId) {
            this.fetchDigest();
        }
    }

    @api companyName;

    // Statuses: 'loading' | 'not_started' | 'completed' | 'error'
    @track status = 'loading';
    @track isError = false;
    @track errorDetails = {};

    generatedDateDisplay = '';
    generatedDurationDisplay = '';

    // Only Executive Summary open on page load
    @track sections = {
        executiveSummary: true,
        recentSignals: false,
        industryContext: false,
        signalInterpretation: false,
        analysis: false,
        pointOfView: false,
        bankerActions: false
    };

    // Parsed Digest Data
    @track digestData = {
        executiveSummary: '',
        recentSignals: [],
        industryContext: [],
        interpretations: [],
        analysis: {
            decisionBeingCreated: '',
            keyTradeoffs: [],
            urgencyAssessment: ''
        },
        pov: {
            confidencePct: 71,
            likelyStage: 2,
            stageName: 'Pressure Building',
            urgencyLevel: 'Urgency is building',
            whatIsHappening: '',
            whyItMatters: '',
            likelyDecisions: '',
            evidence: [],
            priorityConversation: '',
            validationQuestions: []
        },
        bankerActions: []
    };

    connectedCallback() {
        if (this.companyId) {
            this.fetchDigest();
        }
    }

    // ── Fetch Digest from Apex Controller ─────────────────────────────────────
    fetchDigest() {
        const targetId = this.companyId;
        if (!targetId) {
            return;
        }

        this.status = 'loading';
        this.isError = false;

        getEnhancedDigestData({ salesforceCompanyId: targetId })
            .then(responseJson => {
                const response = JSON.parse(responseJson);

                // ── 1. Error Envelope Check ──
                if (response.isError === true || response.status === 'error') {
                    this.isError = true;
                    this.status = 'error';
                    this.errorDetails = {
                        message: response.errorMessage || 'An error occurred during callout.',
                        statusCode: response.statusCode || 500,
                        endpoint: response.endpoint || 'Unknown',
                        responseBody: response.responseBody || 'None',
                        salesforceId: response.salesforceId || targetId,
                        azureCompanyId: response.companyId || 'Unknown',
                        correlationId: response.correlationId || 'N/A',
                        timestamp: response.timestamp || new Date().toLocaleString()
                    };
                    return;
                }

                // ── 2. Completed State with Data ──
                if (response.status === 'completed' && response.digest) {
                    this.isError = false;
                    this.status = 'completed';
                    this.parseApiResponse(response);
                    return;
                }

                // ── 3. Legacy Company (Not Started in Azure) ──
                if (response.status === 'not_started') {
                    this.isError = false;
                    this.status = 'not_started';
                    return;
                }

                // Fallback unexpected status
                this.isError = true;
                this.status = 'error';
                this.errorDetails = {
                    message: 'Unexpected response status: ' + response.status,
                    statusCode: 200,
                    endpoint: 'N/A',
                    responseBody: responseJson,
                    salesforceId: targetId,
                    azureCompanyId: 'N/A',
                    correlationId: 'N/A',
                    timestamp: new Date().toLocaleString()
                };
            })
            .catch(error => {
                this.isError = true;
                this.status = 'error';
                this.errorDetails = {
                    message: error.body?.message || error.message || 'Apex Exception',
                    statusCode: 500,
                    endpoint: 'Apex Controller Callout',
                    responseBody: JSON.stringify(error),
                    salesforceId: targetId,
                    azureCompanyId: 'Unknown',
                    correlationId: 'N/A',
                    timestamp: new Date().toLocaleString()
                };
            });
    }

    handleRetry() {
        this.fetchDigest();
    }

    // ── Parse Azure Payload ──────────────────────────────────────────────────
    parseApiResponse(response) {
        const d = response.digest;

        if (response.generatedAt) {
            this.generatedDateDisplay = new Date(response.generatedAt).toLocaleString('en-US', {
                month: 'numeric', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
            });
        } else {
            this.generatedDateDisplay = '10/12/2026, 6:46:03 PM';
        }

        this.generatedDurationDisplay = response.durationMs 
            ? `${Math.round(response.durationMs / 1000)}s` 
            : '85s';

        const execSummary = d.executive_summary || '';

        // Recent Signals
        const signals = (d.recent_signals || []).map(s => {
            const rawImpact = (s.impact || 'medium').toLowerCase();
            return {
                date: s.date || '',
                headline: s.headline || '',
                description: s.description || '',
                impact: s.impact || 'medium',
                impactBadgeClass: `signal-badge signal-badge-${rawImpact}`,
                signalType: s.signalType || s.signal_type || 'General',
                whatItSignals: s.what_it_signals || s.whatItSignals || '',
                sourceUrl: s.sourceUrl || s.source_url || '',
                bankingOpportunity: s.banking_opportunity || ''
            };
        });

        // Industry Context
        const industry = (d.industry_context || []).map((i, idx) => ({
            id: `ind-${idx}`,
            factor: i.factor || '',
            impact: i.impact || '',
            status: i.status || '',
            hasStatus: Boolean(i.status)
        }));

        // Signal Interpretation
        const interps = (d.signal_interpretation || []).map(item => {
            const rawUrgency = (item.urgency || 'medium').toLowerCase();
            const supportingSignals = item.supporting_signals || item.supportingSignals || [];
            const supportingSignalsText = Array.isArray(supportingSignals) 
                ? supportingSignals.join(' · ') 
                : supportingSignals;

            let formattedUrgency = 'Medium';
            let badgeModifier = 'medium';

            if (rawUrgency.includes('high')) {
                formattedUrgency = 'High';
                badgeModifier = 'high';
            } else if (rawUrgency.includes('low')) {
                formattedUrgency = 'Low';
                badgeModifier = 'low';
            } else {
                formattedUrgency = 'Medium';
                badgeModifier = 'medium';
            }

            return {
                patternName: item.patternName || '',
                patternType: item.patternType ? `(${item.patternType.toLowerCase()})` : '',
                insight: item.insight || '',
                urgency: formattedUrgency,
                urgencyBadgeClass: `urgency-badge urgency-${badgeModifier}`,
                supportingSignalsText: supportingSignalsText,
                hasSupportingSignals: Boolean(supportingSignalsText)
            };
        });

        // Analysis & Key Tradeoffs (Mapped directly to Image 1 format)
        const analysisRaw = d.analysis || {};
        const tradeoffs = (analysisRaw.key_tradeoffs || []).map((t, idx) => ({
            id: `to-${idx}`,
            tradeoff: t.tradeoff || '',
            optionA: t.option_a || t.optionA || '',
            optionB: t.option_b || t.optionB || '',
            financialConsequence: t.financial_consequence || t.financialConsequence || ''
        }));

        // Point of View
        const povRaw = d.point_of_view || {};

        // Banker Actions
        const actions = (d.banker_action_summary || []).map(a => ({
            action: a.action || '',
            priority: a.priority || 'MEDIUM',
            rationale: a.rationale || '',
            urgency: a.urgency || '',
            priorityBadgeClass: `action-priority-badge priority-${(a.priority || 'medium').toLowerCase()}`
        }));

        this.digestData = {
            executiveSummary: execSummary,
            recentSignals: signals,
            industryContext: industry,
            interpretations: interps,
            analysis: {
                decisionBeingCreated: analysisRaw.decision_being_created || analysisRaw.decisionBeingCreated || '',
                keyTradeoffs: tradeoffs,
                urgencyAssessment: analysisRaw.urgency_assessment || analysisRaw.urgencyAssessment || ''
            },
            pov: {
                confidencePct: povRaw.confidence_pct || 71,
                likelyStage: povRaw.likely_stage || 2,
                stageName: povRaw.stage_name || 'Pressure Building',
                urgencyLevel: povRaw.urgency_level || 'Urgency is building',
                whatIsHappening: povRaw.what_is_happening || '',
                whyItMatters: povRaw.why_it_matters || '',
                likelyDecisions: povRaw.likely_decisions || '',
                evidence: povRaw.evidence || [],
                priorityConversation: povRaw.priority_conversation || '',
                validationQuestions: povRaw.validation_questions || []
            },
            bankerActions: actions
        };
    }

    // ── Dynamic POV Stage Cards ──────────────────────────────────────────────
    get povStageCards() {
        const activeStage = this.digestData.pov.likelyStage || 2;

        return [
            {
                number: 1,
                title: 'Decision Awareness',
                quote: '"Something is changing"',
                urgency: 'Little or no Urgency',
                conversation: 'Conversation #1 · Sense-Making',
                isActive: activeStage === 1,
                cardClass: activeStage === 1 ? 'stage-card active-stage-card' : 'stage-card',
                stepNumClass: activeStage === 1 ? 'step-num active-step-num' : 'step-num',
                stepTitleClass: activeStage === 1 ? 'step-title text-white' : 'step-title',
                stepQuoteClass: activeStage === 1 ? 'step-quote text-blue-tint' : 'step-quote',
                urgencyTagClass: activeStage === 1 ? 'urgency-tag text-urgency-amber-light' : 'urgency-tag text-urgency-low',
                conversationTagClass: activeStage === 1 ? 'conversation-tag border-blue-tint text-blue-tint' : 'conversation-tag'
            },
            {
                number: 2,
                title: 'Pressure Building',
                quote: '"We probably need to do something"',
                urgency: 'Urgency is building',
                conversation: 'Conversation #2 · Sense-Making',
                isActive: activeStage === 2,
                cardClass: activeStage === 2 ? 'stage-card active-stage-card' : 'stage-card',
                stepNumClass: activeStage === 2 ? 'step-num active-step-num' : 'step-num',
                stepTitleClass: activeStage === 2 ? 'step-title text-white' : 'step-title',
                stepQuoteClass: activeStage === 2 ? 'step-quote text-blue-tint' : 'step-quote',
                urgencyTagClass: activeStage === 2 ? 'urgency-tag text-urgency-amber-light' : 'urgency-tag text-urgency-mid',
                conversationTagClass: activeStage === 2 ? 'conversation-tag border-blue-tint text-blue-tint' : 'conversation-tag'
            },
            {
                number: 3,
                title: 'Business Decision Window',
                quote: '"We need to make decisions"',
                urgency: 'A strong sense of Urgency',
                conversation: 'Conversation #3 · Frame-Making',
                isActive: activeStage === 3,
                cardClass: activeStage === 3 ? 'stage-card active-stage-card' : 'stage-card',
                stepNumClass: activeStage === 3 ? 'step-num active-step-num' : 'step-num',
                stepTitleClass: activeStage === 3 ? 'step-title text-white' : 'step-title',
                stepQuoteClass: activeStage === 3 ? 'step-quote text-blue-tint' : 'step-quote',
                urgencyTagClass: activeStage === 3 ? 'urgency-tag text-urgency-amber-light' : 'urgency-tag text-urgency-high',
                conversationTagClass: activeStage === 3 ? 'conversation-tag border-blue-tint text-blue-tint' : 'conversation-tag'
            },
            {
                number: 4,
                title: 'Banking Decision Window',
                quote: '"Now we need to finance it"',
                urgency: 'Financing is Urgent',
                conversation: 'Conversation #4 · Financing Translation',
                isActive: activeStage === 4,
                cardClass: activeStage === 4 ? 'stage-card active-stage-card' : 'stage-card',
                stepNumClass: activeStage === 4 ? 'step-num active-step-num' : 'step-num',
                stepTitleClass: activeStage === 4 ? 'step-title text-white' : 'step-title',
                stepQuoteClass: activeStage === 4 ? 'step-quote text-blue-tint' : 'step-quote',
                urgencyTagClass: activeStage === 4 ? 'urgency-tag text-urgency-amber-light' : 'urgency-tag text-urgency-high',
                conversationTagClass: activeStage === 4 ? 'conversation-tag border-blue-tint text-blue-tint' : 'conversation-tag'
            }
        ];
    }

    // ── Getters ──────────────────────────────────────────────────────────────
    get hasKeyTradeoffs() {
        return this.digestData.analysis?.keyTradeoffs && this.digestData.analysis.keyTradeoffs.length > 0;
    }

    get isLoading() {
        return this.status === 'loading';
    }

    get isNotStarted() {
        return this.status === 'not_started' && !this.isError && !this.isLoading;
    }

    get isCompleted() {
        return this.status === 'completed' && !this.isError && !this.isLoading;
    }

    get displayCompanyName() {
        return this.companyName || 'Creature Comforts Brewing Co.';
    }

    get recentSignalsCount() {
        return this.digestData.recentSignals?.length || 0;
    }

    get industryContextCount() {
        return this.digestData.industryContext?.length || 0;
    }

    get interpretationsCount() {
        return this.digestData.interpretations?.length || 0;
    }

    get bankerActionsCount() {
        return this.digestData.bankerActions?.length || 0;
    }

    get execChevronClass() {
        return `chevron-icon ${this.sections.executiveSummary ? 'rotate-180' : ''}`;
    }
    get signalsChevronClass() {
        return `chevron-icon ${this.sections.recentSignals ? 'rotate-180' : ''}`;
    }
    get industryChevronClass() {
        return `chevron-icon ${this.sections.industryContext ? 'rotate-180' : ''}`;
    }
    get interpretationChevronClass() {
        return `chevron-icon ${this.sections.signalInterpretation ? 'rotate-180' : ''}`;
    }
    get analysisChevronClass() {
        return `chevron-icon ${this.sections.analysis ? 'rotate-180' : ''}`;
    }
    get povChevronClass() {
        return `chevron-icon ${this.sections.pointOfView ? 'rotate-180' : ''}`;
    }
    get actionChevronClass() {
        return `chevron-icon ${this.sections.bankerActions ? 'rotate-180' : ''}`;
    }

    // ── Section Accordion Handlers ───────────────────────────────────────────
    handleToggleSection(event) {
        const sectionName = event.currentTarget.dataset.section;
        if (sectionName) {
            this.sections = {
                ...this.sections,
                [sectionName]: !this.sections[sectionName]
            };
        }
    }

    handleExpandAll() {
        this.sections = {
            executiveSummary: true,
            recentSignals: true,
            industryContext: true,
            signalInterpretation: true,
            analysis: true,
            pointOfView: true,
            bankerActions: true
        };
    }

    handleCollapseAll() {
        this.sections = {
            executiveSummary: false,
            recentSignals: false,
            industryContext: false,
            signalInterpretation: false,
            analysis: false,
            pointOfView: false,
            bankerActions: false
        };
    }
}
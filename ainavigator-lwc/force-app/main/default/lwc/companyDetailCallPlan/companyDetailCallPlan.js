import { LightningElement, api, track } from 'lwc';
// Uncomment and point to your Apex method if calling directly from this LWC:
// import getCallPlan from '@salesforce/apex/CompanyDetailController.getCallPlan';

const DEFAULT_DATA = {
    companyName: 'Harbor Logistics',
    companyLocation: 'Charleston, SC',
    companyUrl: 'https://harborlogistics.com/harbor-logistics-goose-creek-project-to-boost-s-c-soybean-exports/',
    companyStatus: 'completed',
    planHeaderTitle: 'St. Meyer & Hubbard Discovery Call Plan',
    bannerTitle: 'Conversation #2 · Sense-Making',
    bannerSubtitle: 'Calibrated to Pressure Building — the required conversation is fundamentally different in each stage.',
    objectiveText:
        'Help Harbor Logistics connect its added capacity, leadership changes and changing cargo flows to what its team is experiencing, then learn what needs attention next.',
    povNote: "Built from the Research Digest's Point of View: its validation questions are woven into Steps 2, 4, 5 and 6.",
    phase1Items: [
        {
            id: 'p1-1',
            label: 'Personal Greeting',
            quote: 'Thanks for making time today. How has your week been?'
        },
        {
            id: 'p1-2',
            label: 'Company/Industry Connection',
            quote: 'It seems like a busy stretch of growth, with the new warehouse open and the soybean project added to the mix. How is that playing out for your team?'
        }
    ],
    phase2Items: [
        {
            id: 'p2-1',
            label: 'Topics to Cover',
            quote: "I was hoping to hear how the added space and soybean work fit with everything else you're handling, and what's changing for your customers."
        },
        {
            id: 'p2-2',
            label: 'Time Confirmation',
            quote: 'We set aside half an hour; does that still work for you?'
        },
        {
            id: 'p2-3',
            label: 'Mutual Goals',
            quote: "I'd like to understand what's taking the most attention as the business grows. What would make this time useful for you?"
        }
    ],
    phase3Items: [
        {
            id: 'p3-1',
            label: 'Step 1: Humble Opener (Safe Delivery)',
            quote: "There's a lot of new capacity in the picture, between the warehouse opening and the soybean project. What's driving the work around those additions?",
            variant: 'green'
        },
        {
            id: 'p3-2',
            label: 'Step 2: Let Buyer React (Safe Delivery)',
            quote: 'How much of your attention is that taking up day to day?',
            variant: 'slate'
        },
        {
            id: 'p3-3',
            label: 'Step 3: Connect the Dots (Sense-Making)',
            quote: "More room to serve customers is coming at a time when port cargo has been uneven. How are those two things meeting in the work you're seeing?",
            variant: 'blue'
        },
        {
            id: 'p3-4',
            label: 'Step 4: Clarify the Decision (Frame-Making)',
            quote: 'What feels like the next thing your team needs to sort out as you put that capacity to work, given your timing?',
            variant: 'green'
        },
        {
            id: 'p3-5',
            label: 'Step 5: Surface Tradeoffs (Frame-Making)',
            quote: 'What has been hardest to manage as you bring the new space into the regular flow of work?',
            variant: 'slate'
        },
        {
            id: 'p3-6',
            label: 'Step 6: Build Confidence (Decision Confidence)',
            quote: 'What would help you feel more confident about how the added capacity is settling into the business?',
            variant: 'blue'
        },
        {
            id: 'p3-7',
            label: 'Step 7: Preserve Agency (Safe Delivery)',
            quote: 'You may already have this well covered, but would it be useful to hear how other logistics teams have handled a stretch of changing cargo flows?',
            variant: 'green'
        }
    ],
    phase4Items: [
        {
            id: 'p4-1',
            label: 'Specific Next Steps',
            quote: "If this is becoming a bigger focus for you, would it make sense to reconnect after you've had more time to see how customer work develops?"
        },
        {
            id: 'p4-2',
            label: 'Mutual Commitments',
            quote: "If that would help, I'll bring a brief peer perspective to a follow-up. Who on your side would find that conversation useful?"
        },
        {
            id: 'p4-3',
            label: 'Timeline & Expectations',
            quote: 'Would a conversation in a couple of weeks be comfortable, or would later be more useful?'
        }
    ],
    earlierJourneyText:
        'What has the new warehouse changed most in your day-to-day work? What is getting your attention around the soybean project now?',
    furtherAlongText:
        'What have you settled on for putting the added capacity to work? What would you still need to know before taking the next step?'
};

const STEP_VARIANTS = ['green', 'slate', 'blue', 'green', 'slate', 'blue', 'green'];

export default class CompanyDetailCallPlan extends LightningElement {
    @api recordId;
    @api showCompanyHeader = false; // Set to true if rendering the top company bar inside this component

    @api companyName = DEFAULT_DATA.companyName;
    @api companyLocation = DEFAULT_DATA.companyLocation;
    @api companyUrl = DEFAULT_DATA.companyUrl;
    @api companyStatus = DEFAULT_DATA.companyStatus;

    @track isDrawerOpen = false;
    @track isDownloading = false;
    @track notesCount = 0;

    @track _callPlanData = null;

    /**
     * Accepts the JSON payload returned by getCallPlan:
     * {
     *   "callPlan": {
     *     "callObjective": "",
     *     "preCallPreparation": [],
     *     "openingStatement": "",
     *     "pppaFramework": { "purpose": "", "process": "", "payoff": "", "agreement": "" },
     *     "discoveryFramework": [],
     *     "keyTalkingPoints": [],
     *     "anticipatedObjections": [],
     *     "nextStepsProposal": ""
     *   }
     * }
     */
    @api
    get callPlanPayload() {
        return this._callPlanData;
    }
    set callPlanPayload(value) {
        if (value) {
            try {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                this._callPlanData = parsed.callPlan || parsed;
            } catch (e) {
                console.error('Error parsing callPlanPayload JSON', e);
            }
        }
    }

    get planHeaderTitle() {
        return DEFAULT_DATA.planHeaderTitle;
    }

    get bannerTitle() {
        return this._callPlanData?.conversationStage || DEFAULT_DATA.bannerTitle;
    }

    get bannerSubtitle() {
        return this._callPlanData?.stageSubtitle || DEFAULT_DATA.bannerSubtitle;
    }

    get objectiveText() {
        if (this._callPlanData?.callObjective) {
            return this._callPlanData.callObjective;
        }
        return DEFAULT_DATA.objectiveText;
    }

    get povNote() {
        return DEFAULT_DATA.povNote;
    }

    // Maps openingStatement & preCallPreparation to Phase 1 (Build Trust & Credibility)
    get phase1Items() {
        const cp = this._callPlanData;
        if (cp && (cp.openingStatement || (Array.isArray(cp.preCallPreparation) && cp.preCallPreparation.length > 0))) {
            const items = [];
            if (cp.openingStatement) {
                items.push({
                    id: 'p1-opening',
                    label: 'Personal Greeting / Opening Statement',
                    quote: this.stripQuotes(cp.openingStatement)
                });
            }
            if (Array.isArray(cp.preCallPreparation) && cp.preCallPreparation.length > 0) {
                cp.preCallPreparation.forEach((prep, idx) => {
                    const text = typeof prep === 'string' ? prep : prep.question || prep.text || prep.statement || '';
                    const label =
                        typeof prep === 'object' && prep.label
                            ? prep.label
                            : idx === 0
                              ? 'Company/Industry Connection'
                              : `Preparation Point ${idx + 1}`;
                    if (text) {
                        items.push({
                            id: `p1-prep-${idx}`,
                            label,
                            quote: this.stripQuotes(text)
                        });
                    }
                });
            }
            if (items.length > 0) return items;
        }
        return DEFAULT_DATA.phase1Items;
    }

    // Maps pppaFramework to Phase 2 (Frame The Discussion)
    get phase2Items() {
        const pppa = this._callPlanData?.pppaFramework;
        if (pppa && (pppa.purpose || pppa.process || pppa.payoff || pppa.agreement)) {
            const items = [];
            if (pppa.purpose) {
                items.push({
                    id: 'p2-purpose',
                    label: 'Topics to Cover',
                    quote: this.stripQuotes(pppa.purpose)
                });
            }
            if (pppa.process || pppa.agreement) {
                items.push({
                    id: 'p2-process',
                    label: 'Time Confirmation',
                    quote: this.stripQuotes(pppa.agreement || pppa.process)
                });
            }
            if (pppa.payoff) {
                items.push({
                    id: 'p2-payoff',
                    label: 'Mutual Goals',
                    quote: this.stripQuotes(pppa.payoff)
                });
            }
            if (items.length > 0) return items;
        }
        return DEFAULT_DATA.phase2Items;
    }

    // Maps discoveryFramework & keyTalkingPoints to Phase 3 (Discovery Conversation)
    get phase3Items() {
        const cp = this._callPlanData;
        let rawSteps = DEFAULT_DATA.phase3Items;

        if (cp && Array.isArray(cp.discoveryFramework) && cp.discoveryFramework.length > 0) {
            rawSteps = cp.discoveryFramework.map((item, idx) => {
                const defaultStep = DEFAULT_DATA.phase3Items[idx] || {};
                const variant = item.variant || STEP_VARIANTS[idx % STEP_VARIANTS.length];
                const label =
                    typeof item === 'object' && (item.step || item.label || item.title)
                        ? item.step || item.label || item.title
                        : defaultStep.label || `Step ${idx + 1}: Discovery`;
                const quote =
                    typeof item === 'string'
                        ? item
                        : item.question || item.quote || item.prompt || item.text || '';

                return {
                    id: `p3-step-${idx}`,
                    label,
                    quote: this.stripQuotes(quote),
                    variant
                };
            });
        }

        return rawSteps.map((step) => ({
            ...step,
            boxClass: `prompt-box step-box-${step.variant}`,
            labelClass: `prompt-label step-label-${step.variant}`
        }));
    }

    // Maps nextStepsProposal to Phase 4 (Joint Commitment)
    get phase4Items() {
        const cp = this._callPlanData;
        if (cp && cp.nextStepsProposal) {
            if (Array.isArray(cp.nextStepsProposal) && cp.nextStepsProposal.length > 0) {
                return cp.nextStepsProposal.map((item, idx) => ({
                    id: `p4-${idx}`,
                    label: item.label || DEFAULT_DATA.phase4Items[idx]?.label || `Next Step ${idx + 1}`,
                    quote: this.stripQuotes(typeof item === 'string' ? item : item.text || item.quote || '')
                }));
            }
            if (typeof cp.nextStepsProposal === 'string' && cp.nextStepsProposal.trim() !== '') {
                return [
                    {
                        id: 'p4-1',
                        label: 'Specific Next Steps',
                        quote: this.stripQuotes(cp.nextStepsProposal)
                    },
                    ...DEFAULT_DATA.phase4Items.slice(1)
                ];
            }
        }
        return DEFAULT_DATA.phase4Items;
    }

    // Maps anticipatedObjections / keyTalkingPoints or fallback to bottom calibration cards
    get earlierJourneyText() {
        const cp = this._callPlanData;
        if (cp && Array.isArray(cp.anticipatedObjections) && cp.anticipatedObjections[0]) {
            const first = cp.anticipatedObjections[0];
            return typeof first === 'string' ? first : first.response || first.text || DEFAULT_DATA.earlierJourneyText;
        }
        return DEFAULT_DATA.earlierJourneyText;
    }

    get furtherAlongText() {
        const cp = this._callPlanData;
        if (cp && Array.isArray(cp.anticipatedObjections) && cp.anticipatedObjections[1]) {
            const second = cp.anticipatedObjections[1];
            return typeof second === 'string' ? second : second.response || second.text || DEFAULT_DATA.furtherAlongText;
        }
        return DEFAULT_DATA.furtherAlongText;
    }

    get drawerClasses() {
        return this.isDrawerOpen ? 'notes-drawer drawer-open' : 'notes-drawer drawer-closed';
    }

    get drawerStyle() {
        return this.isDrawerOpen ? 'width: 480px;' : 'width: 0px;';
    }

    stripQuotes(str) {
        if (!str) return '';
        return str.replace(/^["“]+|["”]+$/g, '');
    }

    toggleNotesDrawer() {
        this.isDrawerOpen = !this.isDrawerOpen;
    }

    handleDownloadPdf() {
        this.dispatchEvent(new CustomEvent('downloadpdf'));
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('navigateback'));
    }

    handleAddNote() {
        this.dispatchEvent(new CustomEvent('addnote'));
    }
}
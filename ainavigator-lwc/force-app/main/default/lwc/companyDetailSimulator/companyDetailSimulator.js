import { LightningElement, api, track } from 'lwc';

const DISCOVERY_STAGES = [
    { id: 0, stage: 'Stage 1', stageName: 'Build Trust',       description: 'Establish rapport and credibility' },
    { id: 1, stage: 'Stage 2', stageName: 'Frame Discussion',  description: 'Set agenda and expectations' },
    { id: 2, stage: 'Stage 3', stageName: 'Goals',             description: 'Understand their objectives and challenges' },
    { id: 3, stage: 'Stage 4', stageName: 'Stories',           description: 'Share relevant success stories and solutions' },
    { id: 4, stage: 'Stage 5', stageName: 'Joint Commitment',  description: 'Agree on next steps together' }
];

const STAGE_QUESTIONS = {
    0: [
        'Thank you for having me here today. I saw the news about your team\'s recent work — congratulations! I\'ve heard great things about the impact your business has in the community.',
        'What prompted you to take this meeting today?',
        'Can you tell me about your role and responsibilities here?'
    ],
    1: [
        'What are the most important things you\'d like to accomplish in our time together?',
        'What should we discuss to make our time together a productive use of your time?',
        'What does success look like for you from this conversation?'
    ],
    2: [
        'What are your biggest challenges when it comes to treasury management?',
        'How do you currently handle your cash flow and working capital?',
        'What does your banking relationship look like today?'
    ],
    3: [
        'What would success look like for you in a banking partnership?',
        'Who else is involved in the decision-making process?',
        'What\'s your timeline for making a change?'
    ],
    4: [
        'Based on what you\'ve shared, I think we can help with your needs.',
        'Can we schedule a follow-up to discuss specific solutions?',
        'I\'d like to prepare a customized proposal for you.'
    ]
};

export default class CompanyDetailSimulator extends LightningElement {

    // Props from parent
    @api company             = null;
    @api aiResearch          = null;
    @api discoveryCallPlan   = null;

    // Internal state
    @track messages          = [];   // { id, role: 'banker'|'prospect'|'coach', content, time }
    @track inputText         = '';
    @track isLoading         = false;
    @track currentStage      = 0;
    @track selectedProspect  = null;
    @track suggestedQuestions= [];
    @track questionsExpanded = true;

    // ── Computed ──────────────────────────────────────────────────────────────

    get companyName() {
        return this.company && this.company.name ? this.company.name : 'the company';
    }

    get stages() {
        return DISCOVERY_STAGES.map((s, i) => ({
            ...s,
            barCls: i < this.currentStage  ? 'stage-bar stage-bar--done'
                  : i === this.currentStage ? 'stage-bar stage-bar--active'
                  : 'stage-bar',
            labelCls: i === this.currentStage ? 'stage-label stage-label--active'
                    : i < this.currentStage   ? 'stage-label stage-label--done'
                    : 'stage-label'
        }));
    }

    get cLevelLeaders() {
        const src = this.aiResearch &&
            (this.aiResearch.leadership || this.aiResearch.geminileadership);
        const data = src && src.data;
        const all  = data ? (data.leaders || data.keyExecutives || []) : [];
        return all.filter(l => {
            const t = (l.title || l.designation || '').toLowerCase();
            return t.includes('ceo') || t.includes('cfo') || t.includes('coo')
                || t.includes('president') || t.includes('founder')
                || t.includes('owner') || t.includes('chief');
        }).slice(0, 5);
    }

    get prospectOptions() {
        return this.cLevelLeaders.map(l => ({
            value: JSON.stringify(l),
            label: (l.fullName || l.name) + ' — ' + (l.designation || l.title || 'Executive')
        }));
    }

    get activeProspect() {
        return this.selectedProspect || this.cLevelLeaders[0] || null;
    }

    get prospectInitial() {
        const p = this.activeProspect;
        if (!p) return 'P';
        const name = p.fullName || p.name || 'Prospect';
        return name.charAt(0).toUpperCase();
    }

    get prospectName() {
        const p = this.activeProspect;
        return p ? (p.fullName || p.name || 'Prospect') : 'Prospect';
    }

    get prospectTitle() {
        const p = this.activeProspect;
        return p ? (p.designation || p.title || 'Executive') : 'Executive';
    }

    get bankerMessages() {
        return this.messages.filter(m => m.role === 'banker' || m.role === 'coach');
    }

    get prospectMessages() {
        return this.messages.filter(m => m.role === 'prospect');
    }

    get hasBankerMessages() {
        return this.bankerMessages.length > 0;
    }

    get hasProspectMessages() {
        return this.prospectMessages.length > 0;
    }

    get isInputEmpty() {
        return !this.inputText || !this.inputText.trim();
    }

    get isSendDisabled() {
        return this.isLoading || this.isInputEmpty;
    }

    get currentSuggestedQuestions() {
        if (this.suggestedQuestions && this.suggestedQuestions.length > 0) {
            return this.suggestedQuestions;
        }
        return STAGE_QUESTIONS[this.currentStage] || STAGE_QUESTIONS[0];
    }

    get isFirstStage()  { return this.currentStage === 0; }
    get isLastStage()   { return this.currentStage === DISCOVERY_STAGES.length - 1; }

    get questionsToggleIcon() {
        return this.questionsExpanded ? '▲' : '▼';
    }

    get suggestedQuestionsLabel() {
        return this.suggestedQuestions.length > 0
            ? 'Follow-up Questions' : 'Suggested Questions';
    }

    // ── Event Handlers ────────────────────────────────────────────────────────

    handleProspectChange(event) {
        const val = event.target.value;
        this.selectedProspect = val ? JSON.parse(val) : null;
    }

    handleInputChange(event) {
        this.inputText = event.target.value;
    }

    handleKeyDown(event) {
        if (event.key === 'Enter' && !this.isSendDisabled) {
            this.sendMessage(this.inputText);
        }
    }

    handleSendClick() {
        if (!this.isSendDisabled) {
            this.sendMessage(this.inputText);
        }
    }

    handleSuggestedQuestion(event) {
        const question = event.currentTarget.dataset.question;
        if (question) this.sendMessage(question);
    }

    handleStageClick(event) {
        const idx = parseInt(event.currentTarget.dataset.index, 10);
        this.currentStage = idx;
        this.suggestedQuestions = [];
    }

    handleToggleQuestions() {
        this.questionsExpanded = !this.questionsExpanded;
    }

    handleReset() {
        this.messages          = [];
        this.currentStage      = 0;
        this.inputText         = '';
        this.suggestedQuestions= [];
        this.isLoading         = false;
    }

    // ── Core send / mock-respond logic ────────────────────────────────────────

    sendMessage(text) {
        if (!text || !text.trim() || this.isLoading) return;

        // Add banker message
        const bankerMsg = {
            id:       Date.now().toString(),
            role:     'banker',
            isCoach:  false,                          // ← ADD
            bubbleCls: 'msg-bubble msg-bubble--banker', // ← ADD
            content:  text,
            time:     this._now()
        };
        this.messages = [...this.messages, bankerMsg];
        this.inputText = '';
        this.isLoading = true;

        // Simulate prospect response after short delay
        // In production this calls: api.post(`user/companies/${companyId}/simulator/chat`, {...})
        setTimeout(() => {
            const prospectResponse = this._generateProspectResponse(text);
            const coachFeedback    = this._generateCoachFeedback(text);

            const newMessages = [...this.messages];

            // Optional coach feedback
            if (coachFeedback) {
                newMessages.push({
                    id:      (Date.now() + 1).toString(),
                    role:    'coach',
                    isCoach: true,           // ← ADD THIS LINE
                    bubbleCls: 'msg-bubble msg-bubble--prospect', // ← ADD
                    content: coachFeedback,
                    time:    this._now()
                });
            }

            // Prospect response
            newMessages.push({
                id:      (Date.now() + 2).toString(),
                role:    'prospect',
                isCoach: false,
                bubbleCls: 'msg-bubble msg-bubble--coach', // ← ADD
                content: prospectResponse,
                time:    this._now()
            });

            this.messages   = newMessages;
            this.isLoading  = false;

            // Advance stage every 3 messages
            const bankerCount = this.messages.filter(m => m.role === 'banker').length;
            if (bankerCount > 0 && bankerCount % 3 === 0 && !this.isLastStage) {
                this.currentStage++;
                this.suggestedQuestions = [];
            }

            // Update suggested follow-ups based on stage
            this.suggestedQuestions = STAGE_QUESTIONS[this.currentStage] || [];

        }, 1200);
    }

    _now() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    _generateProspectResponse(question) {
        const q    = question.toLowerCase();
        const name = this.companyName;

        if (q.includes('growth') || q.includes('rapid'))
            return 'Yes, growth has been our biggest challenge lately. We\'ve expanded to three new locations this year and our banking infrastructure hasn\'t kept up.';
        if (q.includes('cash') || q.includes('treasury') || q.includes('working capital'))
            return 'Our cash management is fairly manual right now. We have multiple accounts across different banks and reconciliation takes up a lot of time at month-end.';
        if (q.includes('banking') || q.includes('bank'))
            return 'We\'ve been with our current bank for about 8 years. They\'ve been fine but we feel like we\'ve outgrown them. We\'re not getting the attention we need at our size.';
        if (q.includes('challenge') || q.includes('problem'))
            return 'Our biggest challenges are cash visibility across locations and managing payroll efficiently. We also need better reporting for our board.';
        if (q.includes('goal') || q.includes('success') || q.includes('look like'))
            return 'Success for us would be a consolidated view of all our accounts, faster payments, and a banking partner that actually understands our industry.';
        if (q.includes('meeting') || q.includes('time') || q.includes('today'))
            return 'A colleague recommended you. We\'ve been looking to make a change and wanted to explore what\'s out there before making a decision.';
        if (q.includes('congratul') || q.includes('award') || q.includes('news'))
            return 'Thank you! We\'re really proud of that. It\'s been a team effort and it\'s great to get that kind of recognition in the community.';
        if (q.includes('who else') || q.includes('decision'))
            return 'It would ultimately be myself, our CFO, and our Board Chair. We like to make big decisions collaboratively.';
        if (q.includes('timeline') || q.includes('when'))
            return 'We\'d like to have something in place by end of Q3. We have some initiatives launching in Q4 that require better banking infrastructure.';
        if (q.includes('next step') || q.includes('proposal') || q.includes('follow'))
            return 'That sounds reasonable. Can you put together something specific to ' + name + '? We don\'t want a generic pitch — we need something tailored to our situation.';

        return 'That\'s a great question. Let me think about that for a moment... We\'ve been working through some of those issues internally. I\'d be curious to hear how you\'ve helped other companies in similar situations.';
    }

    _generateCoachFeedback(question) {
        const q = question.toLowerCase();
        // Only provide feedback when a coaching opportunity exists
        if (q.includes('rate') || q.includes('price') || q.includes('cost'))
            return '💡 Coach Note: Rates came up early. Redirect to value before discussing pricing — "Our rates are competitive, but let me first understand what\'s most important to you..."';
        if (question.length < 20)
            return '💡 Coach Note: Short questions can feel abrupt. Try adding context before asking to build comfort.';
        return null; // No feedback for good questions
    }
}
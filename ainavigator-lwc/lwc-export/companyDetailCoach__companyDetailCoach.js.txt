import { LightningElement, api, track } from 'lwc';

const CATEGORIES = [
    { id: 'all',     label: 'All Questions' },
    { id: 'updates', label: 'Live Updates'  },
    { id: 'signals', label: 'Signals'       },
    { id: 'company', label: 'Company Info'  }
];

export default class CompanyDetailCoach extends LightningElement {

    @api company           = null;
    @api liveUpdates       = [];
    @api signalsData       = null;
    @api aiResearch        = null;
    @api discoveryCallPlan = null;

    @track activeCategory = 'all';
    @track quizIndex      = 0;
    @track answers        = {};
    @track answered       = false;

    get companyName() {
        return (this.company && this.company.name) ? this.company.name : 'this company';
    }

    get categoryButtons() {
        return CATEGORIES.map(c => ({
            id:    c.id,
            label: c.label,
            cls:   c.id === this.activeCategory
                       ? 'filter-btn filter-btn--active'
                       : 'filter-btn'
        }));
    }

    get allQuestions() {
        const name = this.companyName;
        const qs   = [];
        let   id   = 0;

        const rawUpdates = Array.isArray(this.liveUpdates) ? this.liveUpdates : [];
        const allUpdates = rawUpdates.flatMap(s => {
            const updates = (s && s.content && Array.isArray(s.content.updates))
                ? s.content.updates : [];
            return updates.map(u => Object.assign({}, u, { sectionType: s.sectionType }));
        });

        const signals = (this.signalsData && Array.isArray(this.signalsData.signals))
            ? this.signalsData.signals : [];
        const warningSignals     = signals.filter(s => s.signalType === 'Early Warning');
        const opportunitySignals = signals.filter(s => s.signalType === 'Opportunity');

        const leaderSrc  = this.aiResearch &&
            (this.aiResearch.leadership || this.aiResearch.geminileadership);
        const leaderData = leaderSrc && leaderSrc.data;
        const leaders    = leaderData
            ? (leaderData.leaders || leaderData.keyExecutives || []) : [];

        const ceo = leaders.find(l => {
            const t = (l.title || l.designation || '').toLowerCase();
            return t.includes('ceo') || t.includes('chief executive')
                || t.includes('president') || t.includes('founder')
                || t.includes('owner');
        });
        const cfo = leaders.find(l => {
            const t = (l.title || l.designation || '').toLowerCase();
            return t.includes('cfo') || t.includes('chief financial');
        });

        // Q1 - Cash flow opening
        qs.push({
            id: id++, type: 'company', typeLabel: 'Company',
            question: 'At the very opening of the conversation the ' + name
                + ' contact states that the company\'s rapid growth is putting'
                + ' a strain on cash flow. What is your strategy for this conversation?',
            options: [
                'Highlight our competitive interest rates on operating accounts to reduce their banking costs',
                'Discuss how our cash concentration services can optimize their working capital across multiple locations',
                'Offer a comprehensive treasury review to identify inefficiencies in their current cash management',
                'Lead with our digital banking platform features and mobile treasury capabilities'
            ],
            correctAnswer: 'Offer a comprehensive treasury review to identify inefficiencies in their current cash management',
            tip: 'St. Meyer Hubbard\'s consultative approach emphasizes diagnosing before prescribing.',
            context: 'Company: ' + name + '. St. Meyer Hubbard differentiates through advisory-first engagement.'
        });

        // Q2 - Silent CFO
        qs.push({
            id: id++, type: 'company', typeLabel: 'Company',
            question: 'You\'re meeting with ' + name + '\'s CFO. After each of your first two'
                + ' open-ended questions, the CFO gives brief one-sentence answers and then'
                + ' waits silently. How do you draw out a more substantive conversation?',
            options: [
                'Fill the silence with more information about your capabilities',
                'Ask more specific questions that require detailed answers',
                'Embrace the silence as the CFO\'s communication style, slow your pace to accommodate the CFO\'s communication style',
                'Name the dynamic directly'
            ],
            correctAnswer: 'Embrace the silence as the CFO\'s communication style, slow your pace to accommodate the CFO\'s communication style',
            tip: 'Silent clients are often testing whether you\'ll fill space with nervous chatter.',
            context: name + ' meeting. Silence is a powerful discovery tool.'
        });

        // Q3 - 45-minute opener
        qs.push({
            id: id++, type: 'company', typeLabel: 'Company',
            question: 'You\'re about to start a discovery call with ' + name
                + '. The CFO says, "I\'ve got 45 minutes. What did you want to cover?"'
                + ' How do you structure your opening?',
            options: [
                'Share your prepared agenda',
                'Acknowledge the new timeframe and ask "What should we discuss to make our 45 minutes together a productive use of your time?"',
                'Set expectations about the meeting structure',
                'Be direct about your three key questions'
            ],
            correctAnswer: 'Acknowledge the new timeframe and ask "What should we discuss to make our 45 minutes together a productive use of your time?"',
            tip: 'If a contact is pressed for time or they have a very task-oriented communications style, modify your plan to match their style. They will tell you what is important to them.',
            context: name + ' meeting opening. How you start sets the tone.'
        });

        // Q4 - Rate shopper
        qs.push({
            id: id++, type: 'company', typeLabel: 'Company',
            question: name + '\'s controller asks "Before we go further, what are your rates?"'
                + ' How do you handle this?',
            options: [
                'Provide general rate ranges',
                'Deflect until you understand their situation',
                'Redirect: "Our rates are competitive, and I also want to explore how the solutions we provide ' + name + ' are not only economically viable, but also accommodate your long-term growth — could I ask about...?"',
                'Be direct: "Our rates are competitive, but what would make this worth YOUR time beyond pricing?"'
            ],
            correctAnswer: 'Redirect: "Our rates are competitive, and I also want to explore how the solutions we provide ' + name + ' are not only economically viable, but also accommodate your long-term growth — could I ask about...?"',
            tip: 'Take the opportunity to expand the conversation to areas in which you can add value beyond low rate.',
            context: name + ' price inquiry.'
        });

        // Q5 - Summary agreement
        qs.push({
            id: id++, type: 'company', typeLabel: 'Company',
            question: 'As you summarize needs for ' + name
                + ', which summary agreement question most creatively validates your understanding?',
            options: [
                'Did I capture the key points accurately?',
                'Based on our conversation, your top priorities are X, Y, Z. What am I missing?',
                'If I were to summarize this to a colleague, what\'s the one thing you\'d want me to get right?',
                'Does that sum up your situation?'
            ],
            correctAnswer: 'If I were to summarize this to a colleague, what\'s the one thing you\'d want me to get right?',
            tip: 'This question invites them to prioritize without you imposing priorities.',
            context: 'Meta-questions validate understanding and reveal hidden priorities.'
        });

        // Q6 - Executive challenge (conditional — needs CEO or CFO in leadership data)
        const exec = cfo || ceo;
        if (exec) {
            const execName = exec.name || exec.fullName || 'The executive';
            qs.push({
                id: id++, type: 'company', typeLabel: 'Company',
                question: execName + ' from ' + name + ' opens with "I\'ve told three banks'
                    + ' no this month. What makes you different?" How do you respond?',
                options: [
                    'Highlight your three key differentiators',
                    'Acknowledge their frustration and ask what hasn\'t worked',
                    'Match their directness with a unique capability',
                    'Disarm with honesty: "I might be number four. What made you take this meeting?"'
                ],
                correctAnswer: 'Disarm with honesty: "I might be number four. What made you take this meeting?"',
                tip: 'Hostile openings are tests. The winning response acknowledges reality and flips the dynamic.',
                context: 'Executive ' + execName + ' at ' + name + '.'
            });
        }

        // Q7 - Warning signal (conditional)
        if (warningSignals.length > 0) {
            const w = warningSignals[0];
            qs.push({
                id: id++, type: 'signals', typeLabel: 'Signal',
                question: 'You\'ve identified warning signal "' + w.signalName + '" for '
                    + name + '. How do you create urgency without appearing self-serving?',
                options: [
                    'Share a case study of a company that waited too long',
                    '"If this evolved negatively over 6-12 months, what would be at risk?"',
                    'Present the data objectively',
                    'Ask about their internal timeline'
                ],
                correctAnswer: '"If this evolved negatively over 6-12 months, what would be at risk?"',
                tip: 'This question makes them articulate the stakes in their own words.',
                context: w.signalDescription || ('Warning: ' + w.signalName)
            });
        }

        // Q8 - Opportunity signal (conditional)
        if (opportunitySignals.length > 0) {
            const o = opportunitySignals[0];
            qs.push({
                id: id++, type: 'signals', typeLabel: 'Signal',
                question: 'You\'ve identified opportunity "' + o.signalName + '" for '
                    + name + '. What\'s the appropriate next step after a successful discovery call?',
                options: [
                    'Send a detailed proposal within 48 hours',
                    'Schedule a follow-up with additional stakeholders',
                    'Write a personalized summary of what you heard, including unstated insights',
                    'Introduce them to a specialized advisor'
                ],
                correctAnswer: 'Write a personalized summary of what you heard, including unstated insights',
                tip: 'Demonstrate understanding before proposing solutions.',
                context: 'Opportunity: ' + o.signalName
            });
        }

        // Q9 - Live update (conditional)
        if (allUpdates.length > 0) {
            const u = allUpdates[0];
            qs.push({
                id: id++, type: 'updates', typeLabel: 'Live Update',
                question: 'You just received the update: "' + u.headline
                    + '". You have a call scheduled this week with the CFO on another'
                    + ' opportunity. If appropriate, how might you inject the update into your conversation?',
                options: [
                    'If the CFO mentions growth, ask about the update',
                    'Congratulate the CFO during Building Trust and Credibility',
                    'Wait for the CFO to bring up the topic',
                    'Ask about the update at the end of your scheduled call'
                ],
                correctAnswer: 'Congratulate the CFO during Building Trust and Credibility',
                tip: 'Be complimentary and maintain the original purpose of the call.'
                    + ' By sincerely congratulating the CFO at the beginning of the call,'
                    + ' the CFO is more likely to address the topic during or at the end of the call.',
                context: 'Update: ' + u.headline
            });
        }

        // Deterministic shuffle — mirrors React seed logic from CompanyDetail.tsx
        const seed = (this.company && this.company.name ? this.company.name.length : 0)
                   + signals.length;
        return qs.slice().sort((a, b) => ((a.id + seed) % 10) - ((b.id + seed) % 10));
    }

    get filteredQuestions() {
        if (this.activeCategory === 'all') return this.allQuestions;
        const cat = this.activeCategory;
        return this.allQuestions.filter(q => q.type === cat);
    }

    get hasQuestions()   { return this.filteredQuestions.length > 0; }
    get totalQuestions() { return this.filteredQuestions.length; }
    get currentIndex()   { return this.quizIndex + 1; }
    get isFirst()        { return this.quizIndex === 0; }
    get isLast()         { return this.quizIndex >= this.filteredQuestions.length - 1; }

    get currentQuestion() {
        return this.filteredQuestions[this.quizIndex] || null;
    }

    get currentTypeBadgeCls() {
        const t = this.currentQuestion && this.currentQuestion.type;
        if (t === 'updates') return 'type-badge type-badge--updates';
        if (t === 'signals') return 'type-badge type-badge--signals';
        return 'type-badge type-badge--company';
    }

    get currentOptions() {
        const q = this.currentQuestion;
        if (!q) return [];
        const selected = this.answers[q.id];
        return q.options.map((text, i) => {
            const label      = String.fromCharCode(65 + i);
            const isSelected = selected === text;
            const isCorrect  = text === q.correctAnswer;
            let dotCls = 'opt-dot';
            if (this.answered && isSelected && isCorrect)  dotCls += ' opt-dot--correct';
            if (this.answered && isSelected && !isCorrect) dotCls += ' opt-dot--wrong';
            let cls = 'opt-btn';
            if (this.answered) {
                if (isSelected && isCorrect)  cls += ' opt-btn--correct';
                else if (isSelected)          cls += ' opt-btn--wrong';
                else if (isCorrect)           cls += ' opt-btn--correct';
            }
            return { text, label, cls, dotCls };
        });
    }

    get correctCount() {
        return Object.keys(this.answers).filter(idStr => {
            const q = this.allQuestions.find(q => String(q.id) === idStr);
            return q && this.answers[idStr] === q.correctAnswer;
        }).length;
    }

    get answeredCount() {
        return Object.keys(this.answers).length;
    }

    handleCategoryChange(event) {
        this.activeCategory = event.currentTarget.dataset.cat;
        this.quizIndex      = 0;
        this.answered       = false;
    }

    handleAnswer(event) {
        if (this.answered || !this.currentQuestion) return;
        const answer  = event.currentTarget.dataset.answer;
        const updated = Object.assign({}, this.answers);
        updated[this.currentQuestion.id] = answer;
        this.answers  = updated;
        this.answered = true;
    }

    handleNext() {
        if (this.isLast) return;
        this.quizIndex++;
        const q       = this.filteredQuestions[this.quizIndex];
        this.answered = !!(q && this.answers[q.id] !== undefined);
    }

    handlePrevious() {
        if (this.isFirst) return;
        this.quizIndex--;
        const q       = this.filteredQuestions[this.quizIndex];
        this.answered = !!(q && this.answers[q.id] !== undefined);
    }

    handleReset() {
        this.quizIndex  = 0;
        this.answers    = {};
        this.answered   = false;
    }
}
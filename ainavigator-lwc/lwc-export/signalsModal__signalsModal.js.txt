import { LightningElement, api, track } from 'lwc';
import getCallPlan from '@salesforce/apex/DashboardController.getCallPlan';
import getCompanyInfo from '@salesforce/apex/DashboardController.getCompanyInfo';

export default class SignalsModal extends LightningElement {
    @api companyName = '';
    @api companyId = '';
    @api signals = [];

    @track activeTab = 'signals';
    @track _expandedIndexes = [];   // array of expanded signal indexes — LWC tracks arrays reliably
    @track _toggleCount = 0;        // bump to force sortedSignals getter to recompute
    @track callPlanData = null;
    @track companyInfo = null;
    @track isLoadingCallPlan = false;
    @track callPlanError = null;

    PRIORITY_LABELS = {
        5: { label: 'Critical', colorClass: 'p-critical' },
        4: { label: 'High',     colorClass: 'p-high' },
        3: { label: 'Medium',   colorClass: 'p-medium' },
        2: { label: 'Low',      colorClass: 'p-low' },
        1: { label: 'Info',     colorClass: 'p-info' }
    };

    PRIORITY_CARD_CLASSES = {
        5: { bg: 'cp-card-header cp-header-critical', border: 'cp-card cp-border-critical' },
        4: { bg: 'cp-card-header cp-header-high',     border: 'cp-card cp-border-high' },
        3: { bg: 'cp-card-header cp-header-medium',   border: 'cp-card cp-border-medium' },
        2: { bg: 'cp-card-header cp-header-low',      border: 'cp-card cp-border-low' },
        1: { bg: 'cp-card-header cp-header-info',     border: 'cp-card cp-border-info' }
    };
    connectedCallback() {
        this._keyHandler = (e) => { if (e.key === 'Escape') this.handleClose(); };
        window.addEventListener('keydown', this._keyHandler);
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this._keyHandler);
    }
    getSignalPriority(signal) {
        const type     = (signal.signalType || '').toLowerCase();
        const category = (signal.signalCategory || '').toLowerCase();
        const name     = (signal.signalName || '').toLowerCase();
        if (category.includes('capital') || category.includes('acquisition')) return 5;
        if (name.includes('acquisition') || name.includes('funding')) return 5;
        if (category.includes('leadership') || name.includes('cfo') || name.includes('ceo')) return 4;
        if (type.includes('early warning') || category.includes('growth')) return 4;
        if (type.includes('retention risk') || category.includes('risk')) return 3;
        if (category.includes('strategic') || category.includes('expansion')) return 2;
        if (type.includes('opportunity')) return 2;
        return 1;
    }

    get sortedSignals() {
        // _toggleCount is read here so LWC re-evaluates this getter when it changes
        const t = this._toggleCount;
        return [...this.signals]
            .filter(s => s.signalType !== 'Neutral')
            .map((s, i) => {
                const priority = this.getSignalPriority(s);
                const info = this.PRIORITY_LABELS[priority] || this.PRIORITY_LABELS[1];
                const isWarning = s.signalType === 'Early Warning' || s.signalType === 'Retention Risk';
                return {
                    ...s,
                    index: i,
                    priority,
                    priorityLabel: `P${priority} - ${info.label}`,
                    priorityClass: `priority-badge ${info.colorClass}`,
                    signalTypeClass: `type-badge ${isWarning ? 'type-warning' : 'type-opportunity'}`,
                    categoryClass: 'category-badge',
                    rowClass: `signal-row ${isWarning ? 'signal-warning-border' : 'signal-opportunity-border'}${this._expandedIndexes.includes(i) ? ' signal-row-expanded' : ''}`,
                    isExpanded: this._expandedIndexes.includes(i),
                    hasKeyIndicators: s.keyIndicators && s.keyIndicators.length > 0,
                    hasSuggestedActions: !!s.suggestedActions,
                    hasDate: !!(s.eventDate || s.date),
                    displayDate: (s.eventDate || s.date)
                        ? new Date(s.eventDate || s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : ''
                };
            })
            .sort((a, b) => b.priority - a.priority);
    }

    get callPlans() {
        if (!this.callPlanData || !this.callPlanData.callPlans) return [];
        return this.callPlanData.callPlans.map((plan, i) => {
            const priority = plan.signalPriority || 1;
            const info = this.PRIORITY_LABELS[priority] || this.PRIORITY_LABELS[1];
            const cardClasses = this.PRIORITY_CARD_CLASSES[priority] || this.PRIORITY_CARD_CLASSES[1];
            return {
                ...plan,
                index: i,
                planNumber: i + 1,
                priorityLabel: `Priority ${priority} - ${info.label}`,
                priorityClass: `cp-priority-badge ${info.colorClass}`,
                cardClass: cardClasses.border,
                headerClass: cardClasses.bg,
                hasDiscoveryQuestions: plan.discoveryQuestions && plan.discoveryQuestions.length > 0
            };
        });
    }

    get overallStrategy()    { return this.callPlanData?.overallStrategy || ''; }
    get hasOverallStrategy() { return !!this.overallStrategy; }
    get hasCallPlans()       { return this.callPlans.length > 0; }
    get hasCompanyInfo()     { return this.companyInfo !== null; }
    get companyWebsite()     { return this.companyInfo?.website || ''; }
    get hasWebsite()         { return !!this.companyWebsite; }
    get hasRevenue()         { return !!this.companyInfo?.annualRevenue; }
    get warningCount()       { return this.sortedSignals.filter(s => s.signalType === 'Early Warning' || s.signalType === 'Retention Risk').length; }
    get opportunityCount()   { return this.sortedSignals.filter(s => s.signalType === 'Opportunity').length; }
    get topPriority()        { return this.sortedSignals.length > 0 ? `P${this.sortedSignals[0].priority}` : '-'; }
    get hasSignals()         { return this.sortedSignals.length > 0; }
    get isSignalsTab()       { return this.activeTab === 'signals'; }
    get isCallPlanTab()      { return this.activeTab === 'callPlan'; }
    get signalsTabClass()    { return `modal-tab ${this.activeTab === 'signals'  ? 'modal-tab-active' : ''}`; }
    get callPlanTabClass()   { return `modal-tab ${this.activeTab === 'callPlan' ? 'modal-tab-active' : ''}`; }

    handleTabSignals()  { this.activeTab = 'signals'; }
    handleTabCallPlan() {
        this.activeTab = 'callPlan';
        if (!this.callPlanData && !this.isLoadingCallPlan) this.fetchCallPlan();
    }

    fetchCallPlan() {
        this.isLoadingCallPlan = true;
        this.callPlanError = null;
        Promise.all([
            getCallPlan({ companyId: this.companyId }),
            getCompanyInfo({ companyId: this.companyId })
        ])
        .then(([callPlanResult, companyInfoResult]) => {
            this.callPlanData = JSON.parse(callPlanResult);
            this.companyInfo  = JSON.parse(companyInfoResult);
            this.isLoadingCallPlan = false;
        })
        .catch(error => {
            this.callPlanError = error.body?.message || 'Failed to load call plan.';
            this.isLoadingCallPlan = false;
        });
    }

    handleToggleSignal(event) {
        const idx = parseInt(event.currentTarget.dataset.index, 10);
        const current = [...this._expandedIndexes];
        const pos = current.indexOf(idx);
        if (pos >= 0) {
            current.splice(pos, 1);       // collapse
        } else {
            current.push(idx);            // expand
        }
        this._expandedIndexes = current;  // assign new array → LWC detects change
        this._toggleCount++;              // force sortedSignals getter to re-run
    }

    handleRetryCallPlan() {
        this.callPlanData = null;
        this.fetchCallPlan();
    }

    handleClose() { this.dispatchEvent(new CustomEvent('close')); }
    handleBackdropClick(event) { if (event.target === event.currentTarget) this.handleClose(); }
}
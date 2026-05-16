import { LightningElement, api, track } from 'lwc';
import getCallPlan from '@salesforce/apex/CompanyDetailController.getCallPlan';

const SHORT_LABELS = ['Build Trust', 'Frame', 'Explore Needs', 'Stories', 'Commit'];

export default class CompanyDetailCallPlan extends LightningElement {
    @api companyId;
    @api company;
    @track callPlanData = null;
    @track isLoading = true;
    @track activeIndex = 0;
    @track isDownloading = false;

    connectedCallback() {
        getCallPlan({ companyId: this.companyId })
            .then(json => {
                this.callPlanData = JSON.parse(json);
                this.isLoading = false;
            })
            .catch(err => {
                console.error('Call plan load error', err);
                this.isLoading = false;
            });
    }
    get callPlan() { return this.callPlanData?.callPlan || {}; }
    @api handleDownloadPDF() {
        this.isDownloading = true;
        const generator = this.template.querySelector('c-pdf-generator');
        console.log('🔍 callPlanData being passed:', JSON.stringify(this.callPlanData)?.substring(0, 500));
        if (generator) {
            const name = this.company?.name || this.company?.Name || 'Unknown Company';
            generator.generatePDF('callPlan', name, this.callPlanData);
        }
        setTimeout(() => { this.isDownloading = false; }, 3000);
    }
    get _framework() { return this.callPlan.discoveryFramework || []; }

    get steps() {
        return this._framework.map((s, i) => ({
            ...s,
            index:      i,
            shortLabel: SHORT_LABELS[i] || `Step ${i + 1}`,
            navClass:   i === this.activeIndex
                ? 'cdcp-step-btn cdcp-step-btn-active'
                : 'cdcp-step-btn',
            dotClass:   i === this.activeIndex ? 'cdcp-dot cdcp-dot-active' : 'cdcp-dot'
        }));
    }

    get activeStep() {
        const s = this._framework[this.activeIndex] || {};
        const questions = (s.questions || []).map((q, i) => ({
            key:  `q-${i}`,
            num:  i + 1,
            text: q
        }));
        return {
            ...s,
            stMeyerKnowledge: s.stMeyerKnowledge || { title: '', content: [] },
            companyInfo:      s.companyInfo      || { title: '', content: [] },
            questions
        };
    }

    get isPrevDisabled() { return this.activeIndex === 0; }
    get isNextDisabled() { return this.activeIndex >= this._framework.length - 1; }
    get companyName() {
        return this.company?.name || this.company?.Name || 'Unknown Company';
    }

    handleStepClick(event) {
        this.activeIndex = parseInt(event.currentTarget.dataset.index, 10);
    }
    handlePrev() { if (!this.isPrevDisabled) this.activeIndex -= 1; }
    handleNext() { if (!this.isNextDisabled) this.activeIndex += 1; }
}
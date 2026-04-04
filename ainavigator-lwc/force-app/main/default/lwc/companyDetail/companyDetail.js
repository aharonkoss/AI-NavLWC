import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import getCompany     from '@salesforce/apex/CompanyDetailController.getCompany';
import getLiveUpdates from '@salesforce/apex/CompanyDetailController.getLiveUpdates';
import getSignals     from '@salesforce/apex/CompanyDetailController.getSignals';

export default class CompanyDetail extends NavigationMixin(LightningElement) {
    @api companyId;          // set by Lightning App Builder or NavigationMixin state

    @track _companyId = null;
    @track company    = null;
    @track liveUpdates = [];
    @track signalsData          = null;
    @track aiResearch           = null;
    @track discoveryCallPlanData = null;
    @track activeTab  = 'updates';
    @track isLoading  = true;
    @track error      = null;

    // Read companyId from page state (URL param) passed by NavigationMixin
    @wire(CurrentPageReference)
    handlePageRef(pageRef) {
        const idFromState = pageRef?.state?.c__companyId;
        console.log('🔍 CompanyDetail received ID:', idFromState);
        console.log('🔍 Full page state:', JSON.stringify(pageRef?.state));

        if (idFromState && idFromState !== this._companyId) {
            this._companyId = idFromState;
            this.loadCompanyData(idFromState);
        } else if (!idFromState && this.companyId && this.companyId !== this._companyId) {
            this._companyId = this.companyId;
            this.loadCompanyData(this.companyId);
        } else if (!idFromState && !this.companyId) {
            // ── NEW: load a default company instead of showing blank ──
            this._companyId = 'co-001';
            this.loadCompanyData('co-001');
        }
    }

    loadCompanyData(id) {
        this.isLoading = true;
        this.error = null;

        Promise.all([
            getCompany({ companyId: id }),
            getLiveUpdates({ companyId: id }),
            getSignals({ companyId: id })
        ])
        .then(([companyJson, updatesJson, signalsJson]) => {
            this.company     = JSON.parse(companyJson);
            this.liveUpdates = JSON.parse(updatesJson);
            this.signalsData = JSON.parse(signalsJson);
            this.isLoading   = false;
        })
        .catch(err => {
            console.error('CompanyDetail load error', err);
            this.error     = err.body?.message || 'Failed to load company data.';
            this.isLoading = false;
        });
    }

    get hasCompany()  { return !!this._companyId; }
    get showUpdates() { return this.activeTab === 'updates'; }
    get showSignals() { return this.activeTab === 'signals'; }
    get showResearch(){ return this.activeTab === 'research'; }
    get showInsights(){ return this.activeTab === 'insights'; }
    get showCallPlan(){ return this.activeTab === 'callplan'; }
    get showCoach() {return this.activeTab === 'coach';}
    get showSimulator() { return this.activeTab === 'simulator'; }
    get companyName() {
        return this.company?.name || this.company?.Name || '';
    }
    handleTabChange(event) {
        this.activeTab = event.detail.tab;
    }

    handleBackToDashboard() {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'AI_Navigator' }
        });
    }
    handleDownloadPDF() {
        console.log('🔔 CompanyDetail: handleDownloadPDF received, activeTab:', this.activeTab);
        console.log('🔔 showUpdates:', this.showUpdates);
        if (this.showUpdates) {
            const updatesComp = this.template.querySelector('c-company-detail-updates');
            console.log('🔔 updatesComp found:', !!updatesComp);
            updatesComp?.handleDownloadPDF();
        } else if (this.showSignals) {
            const signalsComp = this.template.querySelector('c-company-detail-signals');
            console.log('🔔 signalsComp found:', !!signalsComp);
            signalsComp?.handleDownloadPDF();
        } else if (this.showCallPlan) {
            const callPlanComp = this.template.querySelector('c-company-detail-call-plan');
            console.log('🔔 callPlanComp found:', !!callPlanComp);
            callPlanComp?.handleDownloadPDF();
        }
    }
}
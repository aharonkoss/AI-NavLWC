import { LightningElement, track, api } from 'lwc';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';
import getLiveUpdates from '@salesforce/apex/CompanyDetailController.getLiveUpdates';
import getSignals from '@salesforce/apex/CompanyDetailController.getSignals';
import getCallPlan from '@salesforce/apex/CompanyDetailController.getCallPlan';
import getAiResearch from '@salesforce/apex/CompanyDetailController.getAiResearch';

export default class AiNavigator extends LightningElement {
    @api recordId; // Allows running directly nested inside Salesforce Account Record Page layout
    
    @track activeTab = 'dashboard';
    @track selectedCompanyId = null;
    @track selectedCompanyName = '';
    @track notificationCount = 3;
    @track isLoading = false;

    // Company specific tracker variables to pass into advanced child tabs
    @track company = null;
    @track liveUpdates = [];
    @track signalsData = null;
    @track aiResearch = null;
    @track discoveryCallPlanData = null;

    connectedCallback() {
        // If loaded directly on an Account Record context page, lock onto the current record scope autonomously
        if (this.recordId) {
            this.selectedCompanyId = this.recordId;
            this.activeTab = 'research'; // Focus on corporate research for this specific account
            this.loadCompanyData(this.selectedCompanyId);
        }
    }

    // Dynamic state getters for tab visibility
    get isDashboardTab() { return this.activeTab === 'dashboard'; }
    get isUploadTab() { return this.activeTab === 'upload'; }
    get isInputTab() { return this.activeTab === 'input'; }
    get isSignalsConfigTab() { return this.activeTab === 'signals-config'; }
    get isResearchTab() { return this.activeTab === 'research'; }
    get isSignalsTab() { return this.activeTab === 'signals'; }
    get isInsightsTab() { return this.activeTab === 'insights'; }
    get isCallPlanTab() { return this.activeTab === 'call-plan'; }
    get isCoachTab() { return this.activeTab === 'coach'; }
    get isSimulatorTab() { return this.activeTab === 'simulator'; }
    get isEnhancedDigestTab() { return this.activeTab === 'enhanced-signals'; }
    
    get companySelected() {
        return this.selectedCompanyId !== null;
    }

    // Safe getters to extract company attributes for the c-ai-navigator-header
    get companyCity() {
        return this.company ? (this.company.city || this.company.City || '') : '';
    }

    get companyState() {
        return this.company ? (this.company.state || this.company.State || '') : '';
    }

    get companyWebsite() {
        return this.company ? (this.company.website || this.company.Website || '') : '';
    }

    get companyStatus() {
        return this.company ? (this.company.status || this.company.Status || '') : '';
    }

    // Header navigation event handlers
    handleTabChange(event) {
        this.activeTab = event.detail.tabId;
    }

    handleClearCompany() {
        this.selectedCompanyId = null;
        this.selectedCompanyName = '';
        this.company = null;
        this.liveUpdates = [];
        this.signalsData = null;
        this.aiResearch = null;
        this.discoveryCallPlanData = null;

        if (['research', 'signals', 'insights', 'call-plan', 'coach', 'simulator'].includes(this.activeTab)) {
            this.activeTab = 'dashboard';
        }
    }

    handleClearNotifications() {
        this.notificationCount = 0;
    }

    // Handles selecting a company from the dynamic dashboard component
    handleCompanySelect(event) {
        const detail = event.detail || {};
        this.selectedCompanyId = detail.companyId || detail.id || detail.value || detail;
        this.selectedCompanyName = detail.companyName || detail.name || '';
        this.activeTab = 'research'; // Immediately focus on Research upon target selection

        if (this.selectedCompanyId) {
            this.loadCompanyData(this.selectedCompanyId);
        }
    }

    // Bubble upload success notifications or lists outward if needed
    handleUploadSuccess(event) {
        this.activeTab = 'dashboard';
    }

    // Bubble manual record saves outward if needed
    handleCompanySaved(event) {
        this.activeTab = 'dashboard';
    }

    // Reactively query the Salesforce Apex endpoint for full company metadata
    loadCompanyData(companyId) {
        if (!companyId) return;
        this.isLoading = true;

        Promise.allSettled([
            getCompany({ companyId }),
            getLiveUpdates({ companyId }),
            getSignals({ companyId }),
            getCallPlan({ companyId }),
            getAiResearch({ companyId })
        ])
        .then(results => {
            const getValue = (res) => res.status === 'fulfilled' ? JSON.parse(res.value) : null;
            
            this.company = getValue(results[0]);
            this.liveUpdates = getValue(results[1]) || [];
            this.signalsData = getValue(results[2]);
            this.discoveryCallPlanData = getValue(results[3]);
            this.aiResearch = getValue(results[4]);

            if (this.company) {
                this.selectedCompanyName = this.company.name || this.company.Name || '';
            }
            this.isLoading = false;
        })
        .catch(err => {
            console.error('[aiNavigator] Error loading nested company resources:', err);
            this.isLoading = false;
        });
    }
}
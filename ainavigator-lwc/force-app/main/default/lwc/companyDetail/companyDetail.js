/**
 * @description companyDetail — Parent container for the company detail view.
 *
 *   EMP subscription strategy (v2):
 *     - ONE subscription on /event/AI_Navigator_Inbound__e
 *     - Filters events by EventType__c in the handler (not at subscribe level,
 *       because empApi does not support server-side filtering on custom fields)
 *     - Routes to child components via public @api methods:
 *         RESEARCH_DONE     → reload all sections (full refresh)
 *         PROCESSING_ERROR  → show error state
 *         SIGNAL_ALERT      → companyDetailSignals.refreshSignals(payload)
 *
 *   Company matching:
 *     Inbound events are matched to this company via:
 *       1. payload.salesforceId === this.companyId  (preferred — echoed from create)
 *       2. payload.companyId    === this.company.Azure_Company_Id__c  (fallback)
 *
 *   The EMP subscription is created in connectedCallback and unsubscribed in
 *   disconnectedCallback to prevent memory leaks.
 *
 * @group AI Navigator - LWC
 * @last-modified 2026-04-27
 */
import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';
import getCompany      from '@salesforce/apex/CompanyDetailController.getCompany';
import getLiveUpdates  from '@salesforce/apex/CompanyDetailController.getLiveUpdates';
import getSignals      from '@salesforce/apex/CompanyDetailController.getSignals';

const CHANNEL = '/event/AI_Navigator_Inbound__e';

export default class CompanyDetail extends NavigationMixin(LightningElement) {

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    @api companyId; // set by Lightning App Builder or NavigationMixin state

    // -------------------------------------------------------------------------
    // Internal state
    // -------------------------------------------------------------------------

    @track _companyId    = null;
    @track company       = null;
    @track liveUpdates   = null;
    @track signalsData   = null;
    @track aiResearch    = null;
    @track discoveryCallPlanData = null;
    @track activeTab     = 'updates';
    @track isLoading     = true;
    @track error         = null;

    _subscription        = null; // empApi subscription handle

    // -------------------------------------------------------------------------
    // Wire — read companyId from page state (URL param via NavigationMixin)
    // -------------------------------------------------------------------------

    @wire(CurrentPageReference)
    handlePageRef(pageRef) {
        const idFromState = pageRef?.state?.c__companyId;
        if (idFromState && idFromState !== this._companyId) {
            this._companyId = idFromState;
            this.loadCompanyData(idFromState);
        } else if (!idFromState && !this._companyId && this.companyId) {
            this._companyId = this.companyId;
            this.loadCompanyData(this.companyId);
        }
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    connectedCallback() {
        this._registerEmpErrorHandler();
        this._subscribeToInbound();
    }

    disconnectedCallback() {
        this._unsubscribeFromInbound();
    }

    // -------------------------------------------------------------------------
    // Data load
    // -------------------------------------------------------------------------

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
            console.error('CompanyDetail load error:', err);
            this.error     = err?.body?.message || 'Failed to load company data.';
            this.isLoading = false;
        });
    }

    // -------------------------------------------------------------------------
    // EMP subscription
    // -------------------------------------------------------------------------

    _subscribeToInbound() {
        if (this._subscription) return; // already subscribed

        subscribe(CHANNEL, -1, (event) => {
            this._handleInboundEvent(event);
        })
        .then(sub => {
            this._subscription = sub;
            console.log('CompanyDetail: subscribed to', CHANNEL);
        })
        .catch(err => {
            console.error('CompanyDetail: empApi subscribe error', err);
        });
    }

    _unsubscribeFromInbound() {
        if (!this._subscription) return;
        unsubscribe(this._subscription, (result) => {
            console.log('CompanyDetail: unsubscribed from', CHANNEL, result);
        });
        this._subscription = null;
    }

    _registerEmpErrorHandler() {
        onError(error => {
            console.error('CompanyDetail: empApi error', JSON.stringify(error));
        });
    }

    // -------------------------------------------------------------------------
    // Inbound event routing
    // -------------------------------------------------------------------------

    _handleInboundEvent(event) {
        const data    = event?.data?.payload;
        const evtType = data?.EventType__c;

        if (!evtType) return;

        // Parse the inner Payload__c JSON (envelope pattern)
        let payload = {};
        try {
            payload = data.Payload__c ? JSON.parse(data.Payload__c) : {};
        } catch (e) {
            console.error('CompanyDetail: failed to parse Payload__c', e);
        }

        // Match event to THIS company
        //   Primary:  salesforceId echoed from the original create request
        //   Fallback: Azure companyId matched against Azure_Company_Id__c on local record
        const sfIdMatch    = payload.salesforceId &&
                             payload.salesforceId === this._companyId;
        const azureIdMatch = payload.companyId &&
                             this.company?.Azure_Company_Id__c &&
                             payload.companyId === this.company.Azure_Company_Id__c;

        if (!sfIdMatch && !azureIdMatch) return; // event is for a different company

        console.log(`CompanyDetail: routing ${evtType} event`, payload);

        switch (evtType) {
            case 'RESEARCH_DONE':
                // Full refresh — research is complete, reload all sections
                this.loadCompanyData(this._companyId);
                break;

            case 'PROCESSING_ERROR':
                this.error = payload.message || 'An error occurred during processing.';
                break;

            case 'SIGNAL_ALERT':
                // Route to child — prepend new signals without full page reload
                this._routeSignalAlert(payload);
                break;

            default:
                // UPLOAD_PROCESSED, BATCH_PROGRESS, SCORING_DONE, REPORT_READY
                // are handled by other components (submissions.js, etc.)
                break;
        }
    }

    /**
     * @description Routes a SIGNAL_ALERT payload to companyDetailSignals child.
     *   Called only when the event has been verified to belong to this company.
     */
    _routeSignalAlert(payload) {
        const signalsComp = this.template.querySelector('c-company-detail-signals');
        if (signalsComp) {
            signalsComp.refreshSignals(payload);
        } else {
            // Signals tab is not currently rendered (user is on a different tab).
            // Merge into signalsData so it is ready when the tab is opened.
            const existing = this.signalsData?.signals || [];
            const incoming = payload.signals || [];
            this.signalsData = {
                ...(this.signalsData || {}),
                signals: [...incoming, ...existing]
            };
            console.log(
                'CompanyDetail._routeSignalAlert: signals tab not mounted, ' +
                'merged into signalsData for next render.',
                payload
            );
        }
    }

    // -------------------------------------------------------------------------
    // Computed
    // -------------------------------------------------------------------------

    get hasCompany()    { return !!this._companyId; }
    get companyName()   { return this.company?.name || this.company?.Name || ''; }
    get showUpdates()   { return this.activeTab === 'updates';   }
    get showSignals()   { return this.activeTab === 'signals';   }
    get showResearch()  { return this.activeTab === 'research';  }
    get showInsights()  { return this.activeTab === 'insights';  }
    get showCallPlan()  { return this.activeTab === 'callplan';  }
    get showCoach()     { return this.activeTab === 'coach';     }
    get showSimulator() { return this.activeTab === 'simulator'; }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    handleTabChange(event)       { this.activeTab = event.detail.tab; }
    handleBackToDashboard()      { this[NavigationMixin.Navigate]({}); }

    handleDownloadPDF() {
        if (this.showUpdates) {
            this.template.querySelector('c-company-detail-updates')?.handleDownloadPDF();
        } else if (this.showSignals) {
            this.template.querySelector('c-company-detail-signals')?.handleDownloadPDF();
        } else if (this.showCallPlan) {
            this.template.querySelector('c-company-detail-call-plan')?.handleDownloadPDF();
        }
    }
}
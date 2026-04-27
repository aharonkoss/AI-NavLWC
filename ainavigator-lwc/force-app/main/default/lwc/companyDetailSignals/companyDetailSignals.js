// companyDetailSignals.js
import { LightningElement, api, track, wire } from 'lwc';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';
import getSignals from '@salesforce/apex/CompanyDetailController.getSignals';

const PRIORITY_CLASSES = {
    P5: 'cds-priority cds-p5',
    P4: 'cds-priority cds-p4',
    P3: 'cds-priority cds-p3',
    P2: 'cds-priority cds-p2',
    P1: 'cds-priority cds-p1'
};
const URGENCY_MAP = {
    P5: { label: 'Immediate',    cls: 'cds-urgency cds-urgency-immediate' },
    P4: { label: 'Immediate',    cls: 'cds-urgency cds-urgency-immediate' },
    P3: { label: '1–2 Weeks',    cls: 'cds-urgency cds-urgency-timely'    },
    P2: { label: 'Informational', cls: 'cds-urgency cds-urgency-low'      }
};

const CHANNEL = '/event/AI_Navigator_Inbound__e';

export default class CompanyDetailSignals extends LightningElement {
    @api companyId;          // set by parent — used to scope EMP filter
    @api company;

    @track signalsData = null;
    @track isDownloading = false;
    @track _subscription = null;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    connectedCallback() {
        this._loadSignals();
        this._subscribeToSignalAlerts();
    }

    disconnectedCallback() {
        this._unsubscribe();
    }

    // ─── Apex load ───────────────────────────────────────────────────────────

    _loadSignals() {
        if (!this.companyId) return;
        getSignals({ companyId: this.companyId })
            .then(json => {
                this.signalsData = JSON.parse(json);
            })
            .catch(err => {
                console.error('CompanyDetailSignals: getSignals error', err);
            });
    }

    // ─── EMP subscription ────────────────────────────────────────────────────

    _subscribeToSignalAlerts() {
        if (!this.companyId) return;

        onError(error => {
            console.error('CompanyDetailSignals: EMP channel error', JSON.stringify(error));
        });

        subscribe(CHANNEL, -1, event => {
            this._handleEmpEvent(event);
        }).then(subscription => {
            this._subscription = subscription;
            console.log('CompanyDetailSignals: subscribed to', CHANNEL);
        }).catch(err => {
            console.error('CompanyDetailSignals: subscribe error', err);
        });
    }

    _unsubscribe() {
        if (this._subscription) {
            unsubscribe(this._subscription, response => {
                console.log('CompanyDetailSignals: unsubscribed', JSON.stringify(response));
            });
            this._subscription = null;
        }
    }

    _handleEmpEvent(event) {
        const payload = event?.data?.payload;
        const eventType = payload?.EventType__c;

        // Only respond to SIGNAL_ALERT events for this specific company
        if (eventType !== 'SIGNAL_ALERT') return;

        let body = {};
        try {
            body = JSON.parse(payload?.Payload__c || '{}');
        } catch (e) {
            console.warn('CompanyDetailSignals: could not parse Payload__c', e);
        }

        if (body.companyId !== this.companyId) return;

        console.log('CompanyDetailSignals: SIGNAL_ALERT received for', this.companyId, '— refreshing signals');
        this._loadSignals();
    }

    // ─── Public API: parent can also trigger a refresh (e.g. from companyDetail.js) ──

    @api
    refreshSignals() {
        this._loadSignals();
    }

    // ─── Computed getters (unchanged from original) ───────────────────────────

    get signals() {
        const raw = this.signalsData?.signals;
        if (!raw?.length) return [];
        return raw.map(s => ({
            ...s,
            cardClass:     'cds-card',
            priorityClass: PRIORITY_CLASSES[s.priority] || 'cds-priority',
            categoryClass: 'cds-category',
            urgencyLabel:  URGENCY_MAP[s.priority]?.label  || 'Informational',
            urgencyClass:  URGENCY_MAP[s.priority]?.cls    || 'cds-urgency cds-urgency-low'
        }));
    }

    get hasSignals() {
        return this.signals.length > 0;
    }

    get companyName() {
        return this.company?.name || this.company?.Name || 'Company';
    }

    // ─── PDF download (unchanged) ─────────────────────────────────────────────

    @api
    handleDownloadPDF() {
        try {
            this.isDownloading = true;
            const generator = this.template.querySelector('c-pdf-generator');
            console.log('Signals generator found:', !!generator);
            console.log('Signals data being passed:', JSON.stringify(this.signalsData)?.substring(0, 500));
            if (generator) {
                const name = this.company?.name || this.company?.Name || 'Unknown Company';
                const signalsArray = Array.isArray(this.signalsData)
                    ? this.signalsData
                    : this.signalsData?.signals;
                console.log('Passing signals count:', signalsArray?.length);
                generator.generatePDF('signals', name, signalsArray);
            } else {
                console.error('c-pdf-generator not found in template');
            }
            setTimeout(() => { this.isDownloading = false; }, 3000);
        } catch (e) {
            console.error('handleDownloadPDF error:', e.message, e.stack);
        }
    }
}
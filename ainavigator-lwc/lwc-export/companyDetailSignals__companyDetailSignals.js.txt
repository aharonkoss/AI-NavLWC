/**
 * @description companyDetailSignals — Signals & Risk Assessment child component.
 *
 * Data flow (updated):
 *  1. Initial load → calls CompanySignalsController.getSignals(salesforceCompanyId)
 *     which internally looks up Azure_Company_Id__c and calls
 *     GET /v1/user/companies/{azureCompanyId}/signals on Azure.
 *  2. Live updates → parent companyDetail.js subscribes to AINavigatorInbound__e
 *     and calls the public refreshSignals() @api method when a SIGNALALERT
 *     event arrives for this company.
 *
 * NOTE: The @api company prop is still used for PDF generation.
 *       The @api signalsData prop is now IGNORED on initial mount —
 *       this component fetches its own data via Apex.
 *       signalsData is still accepted for backward-compat with parent
 *       pass-down during live SIGNALALERT updates.
 *
 * @group AI Navigator - LWC
 * @last-modified 2026-05-16
 */
import { LightningElement, api, track, wire } from 'lwc';
import getSignalsApex from '@salesforce/apex/CompanySignalsController.getSignals';

// Priority CSS class map — matches existing .cds-p stylesheet classes
const PRIORITY_CLASSES = {
    P5: 'cds-priority cds-p5',
    P4: 'cds-priority cds-p4',
    P3: 'cds-priority cds-p3',
    P2: 'cds-priority cds-p2',
    P1: 'cds-priority cds-p1'
};

// Priority urgency label + CSS class
const URGENCY_MAP = {
    P5: { label: 'Immediate',    cls: 'cds-urgency cds-urgency-immediate' },
    P4: { label: 'Immediate',    cls: 'cds-urgency cds-urgency-immediate' },
    P3: { label: '1–2 Weeks',    cls: 'cds-urgency cds-urgency-timely'    },
    P2: { label: 'Informational', cls: 'cds-urgency cds-urgency-low'      },
    P1: { label: 'Informational', cls: 'cds-urgency cds-urgency-low'      }
};

const NEW_SIGNAL_BADGE_TTL_MS = 30000; // 30 s — badge auto-hides after this
let signalIdCounter = 0;               // local monotonic ID for keyed iteration

export default class CompanyDetailSignals extends LightningElement {

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Salesforce Company__c.Id — used to fetch signals from Azure via Apex.
     * Set by the parent companyDetail.js component.
     */
    @api
    get companyId() { return this._companyId; }
    set companyId(value) {
        this._companyId = value;
        if (value) {
            this._loadSignals(value);
        }
    }

    /** The current company object — used for PDF generation only. */
    @api company;

    /**
     * Called by companyDetail.js when a SIGNALALERT inbound Platform Event
     * arrives for this company. Prepends the new signals so the user sees
     * them immediately without a full page reload.
     *
     * @param {Object} payload - Parsed SignalAlert.v1 payload
     *   payload.signals  - array of new signal objects
     */
    @api
    refreshSignals(payload) {
        if (!payload || !Array.isArray(payload.signals) || payload.signals.length === 0) {
            console.warn('companyDetailSignals.refreshSignals: empty or invalid payload', payload);
            return;
        }

        const newSignals = payload.signals.map(s => ({
            signalType:        s.signalType        || s.category        || '',
            signalName:        s.headline          || s.signalName      || '',
            signalDescription: s.signalDescription || s.description     || '',
            signalCategory:    s.signalType        || s.signalCategory  || '',
            priority:          s.priority          || s.impact          || 'P1',
            eventDate:         s.detectedAt        || s.eventDate       || new Date().toISOString(),
            source:            s.source            || '',
            id:                `live-${++signalIdCounter}-${Date.now()}`
        }));

        const existing = this._signalsData?.signals || [];
        this._signalsData = {
            ...this._signalsData,
            signals: [...newSignals, ...existing]
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal state
    // ─────────────────────────────────────────────────────────────────────────

    @track _companyId  = null;
    @track _signalsData = null;
    @track isLoading    = true;
    @track error        = null;
    @track newSignalIds = new Set();

    // ─────────────────────────────────────────────────────────────────────────
    // Data load — calls CompanySignalsController.getSignals via imperative Apex
    // ─────────────────────────────────────────────────────────────────────────

    _loadSignals(salesforceCompanyId) {
        this.isLoading = true;
        this.error     = null;

        getSignalsApex({ salesforceCompanyId })
            .then(result => {
                const parsed = JSON.parse(result);
                // Azure returns { signals: [...] }
                // Fall back to array-root for backward compat with mock shape
                this._signalsData = Array.isArray(parsed)
                    ? { signals: parsed }
                    : parsed;
                this.isLoading = false;
            })
            .catch(err => {
                console.error('companyDetailSignals: Azure fetch error', err);
                this.error     = err?.body?.message || 'Failed to load signals from Azure.';
                this.isLoading = false;
            });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PDF download handler (unchanged — wired to existing PDF generator child)
    // ─────────────────────────────────────────────────────────────────────────

    isDownloading = false;

    handleDownloadPDF() {
        const gen = this.template.querySelector('c-pdf-generator');
        if (gen) {
            this.isDownloading = true;
            gen.generatePDF()
                .finally(() => { this.isDownloading = false; });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Computed getters — shape the data for the HTML template
    // ─────────────────────────────────────────────────────────────────────────

    get signals() {
        const raw = this._signalsData?.signals || [];
        return raw.map(sig => {
            const priority = sig.priority || 'P1';
            const urgency  = URGENCY_MAP[priority] || URGENCY_MAP.P1;
            return {
                ...sig,
                id:            sig.id || sig.signalId || `sig-${++signalIdCounter}`,
                priorityClass: PRIORITY_CLASSES[priority] || PRIORITY_CLASSES.P1,
                categoryClass: 'cds-category',
                urgencyClass:  urgency.cls,
                urgencyLabel:  urgency.label,
                cardClass:     'cds-card'
            };
        });
    }

    get hasSignals() {
        return this.signals.length > 0;
    }
}

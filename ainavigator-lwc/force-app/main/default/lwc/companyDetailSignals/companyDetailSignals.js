/**
 * @description companyDetailSignals — Signals & Risk Assessment child component.
 *
 *   Data flow:
 *     1. Initial load  — @api signalsData passed down from companyDetail.js
 *                        (populated by getSignals Apex on page load)
 *     2. Live updates  — parent companyDetail.js subscribes to AI_Navigator_Inbound__e
 *                        and calls the public refreshSignals(@api) method when a
 *                        SIGNAL_ALERT event arrives for this company.
 *                        refreshSignals prepends new signals to the existing list
 *                        so the user sees them immediately without a full page reload.
 *
 *   SignalAlert.v1 payload shape (asyncapi v2):
 *     {
 *       companyId    : string (Azure UUID)
 *       salesforceId : string (SF Company__c.Id — use this to match)
 *       companyName  : string
 *       signalCount  : number
 *       signals      : [{
 *         signalType  : string   e.g. "Leadership"
 *         headline    : string   e.g. "CEO Departure Announced"
 *         impact      : string   P1–P5
 *         priority    : string   P1–P5 (overall tier)
 *         source      : string   e.g. "Reuters"
 *         detectedAt  : ISO 8601 datetime
 *       }]
 *     }
 *
 *   The parent passes the parsed payload object directly to refreshSignals().
 *   This component never subscribes to empApi directly — routing is owned by
 *   companyDetail.js to avoid duplicate subscriptions.
 *
 * @group AI Navigator - LWC
 * @last-modified 2026-04-27
 */
import { LightningElement, api, track } from 'lwc';

// Priority → CSS class map (matches existing .cds-p* stylesheet classes)
const PRIORITY_CLASSES = {
    P5: 'cds-priority cds-p5',
    P4: 'cds-priority cds-p4',
    P3: 'cds-priority cds-p3',
    P2: 'cds-priority cds-p2',
    P1: 'cds-priority cds-p1'
};

// Priority → urgency label + CSS class
const URGENCY_MAP = {
    P5: { label: 'Immediate',     cls: 'cds-urgency cds-urgency-immediate' },
    P4: { label: 'Immediate',     cls: 'cds-urgency cds-urgency-immediate' },
    P3: { label: '1–2 Weeks',     cls: 'cds-urgency cds-urgency-timely'    },
    P2: { label: 'Informational', cls: 'cds-urgency cds-urgency-low'       },
    P1: { label: 'Informational', cls: 'cds-urgency cds-urgency-low'       }
};

// Badge shown on new signals prepended via SIGNAL_ALERT event
const NEW_SIGNAL_BADGE_TTL_MS = 30000; // 30 s — badge auto-hides after this

let _signalIdCounter = 0; // local monotonic ID for keyed iteration

export default class CompanyDetailSignals extends LightningElement {
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Initial signals data passed by companyDetail.js from Apex getSignals() */
    @api
    get signalsData() {
        return this._signalsData;
    }
    set signalsData(value) {
        this._signalsData = value;
        this._newSignalIds = new Set(); // clear "new" badges on fresh load
    }

    /** The current company object — used for PDF generation */
    @api company;

    /**
     * @description Called by companyDetail.js when a SIGNAL_ALERT inbound event
     *              arrives for this company. Prepends the new signals so the user
     *              sees them immediately without a page reload.
     *
     * @param {Object} payload - Parsed SignalAlert.v1 payload from the event
     *   payload.signals  — array of new signal objects
     *   payload.companyId / payload.salesforceId — for caller-side matching (done by parent)
     */
    @api
    refreshSignals(payload) {
        if (!payload || !Array.isArray(payload.signals) || payload.signals.length === 0) {
            console.warn('companyDetailSignals.refreshSignals: empty or invalid payload', payload);
            return;
        }

        // Map incoming signals to the same shape used by the existing getter
        const newSignals = payload.signals.map(s => ({
            // Use SignalAlert.v1 field names; fall back to legacy names for compatibility
            signalType       : s.signalType        || s.category         || '',
            signalName       : s.headline          || s.signalName       || '',
            signalDescription: s.signalDescription || s.description      || '',
            signalCategory   : s.signalType        || s.signalCategory   || '',
            priority         : s.priority          || s.impact           || 'P1',
            eventDate        : s.detectedAt        || s.eventDate        || new Date().toISOString(),
            source           : s.source            || '',
            // Unique key for lwc:key — prefixed so it never collides with Apex-loaded IDs
            id               : `live-${ ++_signalIdCounter }-${ Date.now() }`
        }));

        // Build the updated signals wrapper — same shape as Apex getSignals() response
        const existing = this._signalsData?.signals || [];
        this._signalsData = {
            ...(this._signalsData || {}),
            signals: [...newSignals, ...existing]
        };

        // Mark new IDs so the template can show a "New" badge briefly
        const newIds = new Set(this._newSignalIds || []);
        newSignals.forEach(s => newIds.add(s.id));
        this._newSignalIds = newIds;

        // Auto-clear "new" badges after TTL
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this._newSignalIds = new Set();
        }, NEW_SIGNAL_BADGE_TTL_MS);

        console.log(
            `companyDetailSignals.refreshSignals: prepended ${newSignals.length} new signal(s)`,
            payload
        );
    }

    // -------------------------------------------------------------------------
    // Internal state
    // -------------------------------------------------------------------------

    _signalsData = null;
    _newSignalIds = new Set();

    @track isDownloading = false;

    // -------------------------------------------------------------------------
    // Computed — signal list with all display classes resolved
    // -------------------------------------------------------------------------

    get signals() {
        const raw = this._signalsData?.signals;
        if (!Array.isArray(raw) || raw.length === 0) return [];

        return raw.map(s => {
            const priority = s.priority || s.impact || 'P1';
            const isNew = this._newSignalIds?.has(s.id);
            return {
                ...s,
                id           : s.id || `sig-${_signalIdCounter++}`,
                cardClass    : `cds-card${isNew ? ' cds-card--new' : ''}`,
                priorityClass: PRIORITY_CLASSES[priority] || 'cds-priority',
                categoryClass: 'cds-category',
                urgencyLabel : URGENCY_MAP[priority]?.label || 'Informational',
                urgencyClass : URGENCY_MAP[priority]?.cls   || 'cds-urgency cds-urgency-low',
                isNew
            };
        });
    }

    get hasSignals() {
        return this.signals.length > 0;
    }

    get companyName() {
        return this.company?.name || this.company?.Name || 'Company';
    }

    // -------------------------------------------------------------------------
    // PDF download — delegates to c-pdf-generator
    // -------------------------------------------------------------------------

    @api
    handleDownloadPDF() {
        try {
            this.isDownloading = true;
            const generator = this.template.querySelector('c-pdf-generator');
            if (!generator) {
                console.error('companyDetailSignals: c-pdf-generator not found in template');
                this.isDownloading = false;
                return;
            }
            // Unwrap LWC Proxy before passing to jsPDF
            const signalsArray = Array.isArray(this._signalsData)
                ? this._signalsData
                : (this._signalsData?.signals || []);
            generator.generatePDF('signals', this.companyName, signalsArray);
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.isDownloading = false; }, 3000);
        } catch (e) {
            console.error('companyDetailSignals.handleDownloadPDF error:', e.message, e.stack);
            this.isDownloading = false;
        }
    }
}
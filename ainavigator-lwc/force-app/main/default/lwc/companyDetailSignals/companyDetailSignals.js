/**
 * @description companyDetailSignals — Signals & Risk Assessment child component.
 *
 * Data flow (updated):
 *  1. Initial load → reads c__companyId query parameter (via CurrentPageReference 
 *     with a window.location fallback for hard page refreshes) or falls back to parent @api prop,
 *     then calls CompanySignalsController.getSignals(salesforceCompanyId)
 *  2. Live updates → parent companyDetail.js subscribes to AINavigatorInbound__e
 *     and calls the public refreshSignals() @api method when a SIGNALALERT
 *     event arrives for this company.
 *
 * @group AI Navigator - LWC
 * @last-modified 2026-05-28
 */
import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
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
    // Internal state
    // ─────────────────────────────────────────────────────────────────────────

    @track _companyId  = null;
    @track _signalsData = null;
    @track isLoading    = true;
    @track error        = null;
    @track newSignalIds = new Set();
    
    // Prevent duplicate Apex calls if wire and api setters trigger consecutively
    _lastLoadedCompanyId = null;

    // ─────────────────────────────────────────────────────────────────────────
    // Page Reference Wire (Reads c__companyId query parameter)
    // ─────────────────────────────────────────────────────────────────────────

    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        console.log('[CDS] Current page reference state details:', JSON.stringify(currentPageReference?.state));
        
        let urlCompanyId;

        // Try standard LWC page reference parsing first
        if (currentPageReference && currentPageReference.state && currentPageReference.state.c__companyId) {
            urlCompanyId = currentPageReference.state.c__companyId;
            console.log('[CDS] Detected URL parameter c__companyId via PageReference:', urlCompanyId);
        } else {
            // Fallback for hard page refreshes where state is initially empty
            try {
                const urlParams = new URLSearchParams(window.location.search);
                urlCompanyId = urlParams.get('c__companyId');
                if (urlCompanyId) {
                    console.log('[CDS] Fallback: Detected c__companyId via window.location.search:', urlCompanyId);
                }
            } catch (e) {
                console.error('[CDS] Fallback parsing failed:', e);
            }
        }
        
        if (urlCompanyId) {
            this._companyId = urlCompanyId;
            this._loadSignals(urlCompanyId);
        } else {
            console.warn('[CDS] No companyId detected yet. Remaining in loading state.');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Salesforce Company__c.Id — fallback mechanism if passed by parent component.
     */
    @api
    get companyId() { return this._companyId; }
    set companyId(value) {
        console.log('[CDS] API companyId setter called with value:', value);
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
     */
    @api
    refreshSignals(payload) {
        if (!payload || !Array.isArray(payload.signals) || payload.signals.length === 0) {
            console.warn('[CDS] refreshSignals: empty or invalid payload', payload);
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
    // Data load — calls CompanySignalsController.getSignals via imperative Apex
    // ─────────────────────────────────────────────────────────────────────────

    _loadSignals(salesforceCompanyId) {
        // Guard against duplicate network requests
        if (this._lastLoadedCompanyId === salesforceCompanyId) {
            console.log('[CDS] Call to _loadSignals bypassed. Already loaded/loading companyId:', salesforceCompanyId);
            return;
        }

        console.log('[CDS] Calling getSignals Apex for companyId:', salesforceCompanyId);
        this._lastLoadedCompanyId = salesforceCompanyId;
        this.isLoading = true;
        this.error     = null;

        getSignalsApex({ salesforceCompanyId })
            .then(result => {
                console.log('[CDS] Apex signals payload returned successfully.');
                const parsed = JSON.parse(result);
                console.log('[CDS] Raw parsed response structure:', JSON.stringify(parsed));

                // Normalize nested API structure (handles 'data.signals' vs 'signals' vs array root)
                let signalsArray = [];
                if (Array.isArray(parsed)) {
                    signalsArray = parsed;
                } else if (parsed?.data?.signals && Array.isArray(parsed.data.signals)) {
                    signalsArray = parsed.data.signals;
                } else if (parsed?.signals && Array.isArray(parsed.signals)) {
                    signalsArray = parsed.signals;
                }

                console.log(`[CDS] Normalized signals array. Total items: ${signalsArray.length}`);
                this._signalsData = { signals: signalsArray };
                this.isLoading = false;
            })
            .catch(err => {
                console.error('[CDS] Azure fetch error:', err);
                this.error     = err?.body?.message || 'Failed to load signals from Azure.';
                this.isLoading = false;
            });
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
        const has = this.signals.length > 0;
        console.log('[CDS] hasSignals evaluation status:', has);
        return has;
    }
}
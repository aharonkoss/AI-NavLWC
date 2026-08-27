import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getSignalsApex from '@salesforce/apex/CompanySignalsController.getSignals';
import getSignalsPdfDownloadUrl from '@salesforce/apex/CompanySignalsController.getSignalsPdfDownloadUrl';

// Priority CSS class map
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

let signalIdCounter = 0;

export default class CompanyDetailSignals extends LightningElement {

    @track _companyId  = null;
    @track _signalsData = null;
    @track isLoading    = true;
    @track error        = null;
    @track isDownloadingPdf = false;
    
    _lastLoadedCompanyId = null;

    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        let urlCompanyId;

        if (currentPageReference && currentPageReference.state && currentPageReference.state.c__companyId) {
            urlCompanyId = currentPageReference.state.c__companyId;
        } else {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                urlCompanyId = urlParams.get('c__companyId');
            } catch (e) {
                console.error('[CDS] Fallback parsing failed:', e);
            }
        }
        
        if (urlCompanyId) {
            this._companyId = urlCompanyId;
            this._loadSignals(urlCompanyId);
        }
    }

    @api
    get companyId() { return this._companyId; }
    set companyId(value) {
        this._companyId = value;
        if (value) {
            this._loadSignals(value);
        }
    }

    @api company;

    @api
    refreshSignals(payload) {
        if (!payload || !Array.isArray(payload.signals) || payload.signals.length === 0) {
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

    _loadSignals(salesforceCompanyId) {
        if (this._lastLoadedCompanyId === salesforceCompanyId) {
            return;
        }

        this._lastLoadedCompanyId = salesforceCompanyId;
        this.isLoading = true;
        this.error     = null;

        getSignalsApex({ salesforceCompanyId })
            .then(result => {
                const parsed = JSON.parse(result);

                let signalsArray = [];
                if (Array.isArray(parsed)) {
                    signalsArray = parsed;
                } else if (parsed?.data?.signals && Array.isArray(parsed.data.signals)) {
                    signalsArray = parsed.data.signals;
                } else if (parsed?.signals && Array.isArray(parsed.signals)) {
                    signalsArray = parsed.signals;
                }

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
    // PDF Download Action
    // ─────────────────────────────────────────────────────────────────────────
    handleDownloadPdf() {
        if (!this._companyId || this.isDownloadingPdf) return;

        this.isDownloadingPdf = true;

        getSignalsPdfDownloadUrl({ salesforceCompanyId: this._companyId })
            .then((json) => {
                if (!json) {
                    throw new Error('No PDF URL returned by the server.');
                }

                const data = typeof json === 'string' ? JSON.parse(json) : json;

                if (data.downloadUrl) {
                    const link = document.createElement('a');
                    link.href = data.downloadUrl;
                    link.download = data.fileName || 'signals.pdf';
                    link.target = '_blank';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } else {
                    throw new Error('PDF download URL not found in response.');
                }
            })
            .catch((err) => {
                const errorMsg = err?.body?.message || err?.message || 'Failed to download Signals PDF.';
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Download Error',
                        message: errorMsg,
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.isDownloadingPdf = false;
            });
    }

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
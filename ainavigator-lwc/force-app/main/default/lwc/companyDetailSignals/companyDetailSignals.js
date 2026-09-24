import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getSignals from '@salesforce/apex/CompanyDetailController.getSignals';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';
import getTabPdfDownloadUrl from '@salesforce/apex/CompanyDetailController.getTabPdfDownloadUrl';

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
  P5: { label: 'Immediate', cls: 'cds-urgency cds-urgency-immediate' },
  P4: { label: 'Immediate', cls: 'cds-urgency cds-urgency-immediate' },
  P3: { label: '1–2 Weeks', cls: 'cds-urgency cds-urgency-timely' },
  P2: { label: 'Informational', cls: 'cds-urgency cds-urgency-low' },
  P1: { label: 'Informational', cls: 'cds-urgency cds-urgency-low' }
};

let signalIdCounter = 0;

export default class CompanyDetailSignals extends LightningElement {
  _companyId = null;
  _isConnected = false;

  @track _signalsData = null;
  @track isLoading = true;
  @track error = null;
  @track isDownloadingPdf = false;
  @track _dynamicCompanyName = '';

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const hasChanged = this._companyId !== value;
    this._companyId = value;

    if (value && (hasChanged || !this._signalsData)) {
      this.resetAndLoadAll(value);
    }
  }

  @api company;
  @api companyName;

  connectedCallback() {
    this._isConnected = true;

    if (!this._companyId) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get('c__companyId');
        if (urlId) {
          this._companyId = urlId;
        }
      } catch (e) {
        console.warn('URL parameter parsing fallback skipped.');
      }
    }

    if (this._companyId) {
      this.resetAndLoadAll(this._companyId);
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
  }

  resetAndLoadAll(companyId) {
    this._signalsData = null;
    this._dynamicCompanyName = '';
    this.error = null;
    this.isLoading = true;

    this.fetchCompanyDetails(companyId);
    this.loadSignalsData(companyId);
  }

  fetchCompanyDetails(companyId) {
    const targetId = companyId || this._companyId;
    if (!targetId) return;

    getCompany({ companyId: targetId })
      .then((res) => {
        if (!res) return;
        const comp = typeof res === 'string' ? JSON.parse(res) : res;
        this._dynamicCompanyName = comp.name || comp.Name || '';
      })
      .catch((e) => {
        console.warn('Could not fetch company info:', e);
      });
  }

  loadSignalsData(companyId) {
    const targetId = companyId || this._companyId;
    if (!targetId) {
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.error = null;

    getSignals({ companyId: targetId })
      .then((result) => {
        if (!result) {
          this._signalsData = { signals: [] };
          return;
        }

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;

        let signalsArray = [];
        if (Array.isArray(parsed)) {
          signalsArray = parsed;
        } else if (parsed?.data?.signals && Array.isArray(parsed.data.signals)) {
          signalsArray = parsed.data.signals;
        } else if (parsed?.signals && Array.isArray(parsed.signals)) {
          signalsArray = parsed.signals;
        }

        this._signalsData = { signals: signalsArray };
      })
      .catch((err) => {
        console.error('[CDS] Signals fetch error:', err);
        this.error = err?.body?.message || err?.message || 'Failed to load signals from Azure.';
        this._signalsData = { signals: [] };
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PDF Download Action
  // ─────────────────────────────────────────────────────────────────────────
  handleDownloadPdf() {
    if (!this._companyId || this.isDownloadingPdf) return;

    this.isDownloadingPdf = true;

    getTabPdfDownloadUrl({ companyId: this._companyId, tabName: 'signals' })
      .then((json) => {
        if (!json) {
          throw new Error('No PDF URL returned by the server.');
        }

        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const downloadUrl = data.downloadUrl || data.url || data.pdfUrl;

        if (downloadUrl) {
          const link = document.createElement('a');
          link.href = downloadUrl;
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

  // ─── Getters ───

  get signals() {
    const raw = this._signalsData?.signals || [];
    return raw.map((sig) => {
      const priority = sig.priority || 'P1';
      const urgency = URGENCY_MAP[priority] || URGENCY_MAP.P1;
      return {
        ...sig,
        id: sig.id || sig.signalId || `sig-${++signalIdCounter}`,
        priorityClass: PRIORITY_CLASSES[priority] || PRIORITY_CLASSES.P1,
        categoryClass: 'cds-category',
        urgencyClass: urgency.cls,
        urgencyLabel: urgency.label,
        cardClass: 'cds-card'
      };
    });
  }

  get hasSignals() {
    return this.signals.length > 0;
  }

  get displayCompanyName() {
    return (
      this.companyName ||
      this.company?.name ||
      this.company?.Name ||
      this._dynamicCompanyName ||
      'Company'
    );
  }
}
import { LightningElement, api, track } from 'lwc';
import getUccFilings from '@salesforce/apex/CompanyDetailController.getUccFilings';

function formatDate(d) {
  if (!d) return null;
  try {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
      const [year, month, day] = d.trim().split('-').map(Number);
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (e) {
    return d;
  }
}

function buildUccViewModel(raw) {
  console.log('%c[detailUcc] buildUccViewModel() called with raw data:', 'color: #9333ea; font-weight: bold;', raw);

  if (!raw) {
    console.warn('[detailUcc] raw is null or undefined, returning empty model');
    return {
      totalFilings: 0,
      businessName: null,
      hasFilings: false,
      filings: []
    };
  }

  // 1. Array Extraction
  let rawFilings = [];
  if (Array.isArray(raw.uccFilings)) {
    rawFilings = raw.uccFilings;
  } else if (Array.isArray(raw.ucc_filings)) {
    rawFilings = raw.ucc_filings;
  } else if (Array.isArray(raw.filings)) {
    rawFilings = raw.filings;
  } else if (Array.isArray(raw.records)) {
    rawFilings = raw.records;
  } else if (Array.isArray(raw)) {
    rawFilings = raw;
  } else if (raw.data && Array.isArray(raw.data.uccFilings)) {
    rawFilings = raw.data.uccFilings;
  } else if (raw.data && Array.isArray(raw.data.filings)) {
    rawFilings = raw.data.filings;
  }

  console.log(`[detailUcc] Extracted ${rawFilings.length} raw filings.`);

  // 2. Business Name Extraction
  const businessName =
    raw.business?.name ||
    raw.companyName ||
    raw.businessName ||
    raw.company_name ||
    null;

  // 3. Total Count
  const totalFilings =
    raw.totalFilings !== undefined && raw.totalFilings !== null
      ? raw.totalFilings
      : rawFilings.length;

  // 4. Sort Newest First
  const sorted = [...rawFilings].sort((a, b) => {
    const ta = new Date(a.filedDate || a.filingDate || 0).getTime();
    const tb = new Date(b.filedDate || b.filingDate || 0).getTime();
    return tb - ta;
  });

  // 5. Transform Filings
  const filings = sorted.map((f, idx) => {
    const statusRaw = (f.status || '').toLowerCase();
    let statusClass = 'ucc-badge ucc-badge--neutral';
    let statusDisplay = f.status || 'Active';

    if (statusRaw === 'active' || statusRaw === 'open') {
      statusClass = 'ucc-badge ucc-badge--active';
      statusDisplay = 'Active';
    } else if (statusRaw === 'closed' || statusRaw === 'terminated' || statusRaw === 'lapsed') {
      statusClass = 'ucc-badge ucc-badge--closed';
      statusDisplay = 'Closed';
    } else if (statusRaw === 'unknown') {
      statusClass = 'ucc-badge ucc-badge--neutral';
      statusDisplay = 'Unknown';
    }

    // Secured Parties
    let securedParties = [];
    const rawSec = f.securedParties || f.secured_parties || f.securedParty;
    if (Array.isArray(rawSec) && rawSec.length > 0) {
      securedParties = rawSec
        .map((p, pIdx) => ({
          key: `sp-${idx}-${pIdx}`,
          name: typeof p === 'string' ? p : p.name || p.orgName || p.organizationName || '',
          address: typeof p === 'string' ? '' : p.address || '',
          hasAddress: typeof p === 'object' && !!p.address && p.address.trim().length > 0
        }))
        .filter((p) => p.name);
    } else if (f.securedPartyName) {
      securedParties = [
        {
          key: `sp-${idx}-0`,
          name: f.securedPartyName,
          address: f.securedPartyAddress || '',
          hasAddress: !!f.securedPartyAddress && f.securedPartyAddress.trim().length > 0
        }
      ];
    }

    // Debtors
    let debtors = [];
    const rawDeb = f.debtors || f.debtor || f.debtorParties;
    if (Array.isArray(rawDeb) && rawDeb.length > 0) {
      debtors = rawDeb
        .map((d, dIdx) => ({
          key: `dbt-${idx}-${dIdx}`,
          name: typeof d === 'string' ? d : d.name || d.orgName || d.organizationName || '',
          address: typeof d === 'string' ? '' : d.address || '',
          hasAddress: typeof d === 'object' && !!d.address && d.address.trim().length > 0
        }))
        .filter((d) => d.name);
    } else if (f.debtorName) {
      debtors = [
        {
          key: `dbt-${idx}-0`,
          name: f.debtorName,
          address: f.debtorAddress || '',
          hasAddress: !!f.debtorAddress && f.debtorAddress.trim().length > 0
        }
      ];
    }

    const collateral = f.collateral || f.collateralDescription || null;
    const hasCollateral = !!collateral && collateral.trim().length > 0;

    return {
      key: `filing-${f.filingNumber || f.uccNumber || idx}`,
      label: `Filing #${idx + 1}`,
      filingType: (f.filingType || 'UCC').toUpperCase(),
      statusDisplay,
      statusClass,
      jurisdiction: f.jurisdiction || f.state || '',
      filedDate: formatDate(f.filedDate || f.filingDate),
      expiresDate: formatDate(f.expirationDate || f.lapse_date),
      securedParties,
      hasSecuredParties: securedParties.length > 0,
      debtors,
      hasDebtors: debtors.length > 0,
      collateral,
      hasCollateral
    };
  });

  const viewModel = {
    totalFilings,
    businessName,
    hasFilings: filings.length > 0,
    filings
  };

  console.log('%c[detailUcc] Final Generated View Model:', 'color: #059669; font-weight: bold;', viewModel);
  return viewModel;
}

export default class DetailUcc extends LightningElement {
  _companyId;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    console.log(`[detailUcc] @api companyId updated to: "${value}"`);
    const hasChanged = this._companyId !== value;
    this._companyId = value;
    if (value && hasChanged) {
      this._uccLoaded = false;
      this.loadUccData();
    }
  }

  @track _viewModel = null;
  @track _isLoading = false;
  @track _error = null;
  @track _uccLoaded = false;
  @track rawJsonDebugString = '';

  connectedCallback() {
    console.log(`[detailUcc] connectedCallback() fired. Current companyId: "${this._companyId}"`);
    if (this._companyId && !this._uccLoaded) {
      this.loadUccData();
    }
  }

  loadUccData() {
    if (this._isLoading) {
      console.warn('[detailUcc] loadUccData skipped: already loading.');
      return;
    }
    if (!this._companyId) {
      console.warn('[detailUcc] loadUccData skipped: companyId is missing or empty.');
      return;
    }

    console.log(`%c[detailUcc] Fetching UCC data from Apex for companyId: ${this._companyId}`, 'color: #2563eb; font-weight: bold;');
    this._isLoading = true;
    this._error = null;

    getUccFilings({ companyId: this._companyId })
      .then((res) => {
        console.group('%c[detailUcc] Apex getUccFilings Response Received', 'color: #1d4ed8; font-weight: bold;');
        console.log('Type of response:', typeof res);
        console.log('Raw response:', res);

        if (!res) {
          console.warn('Response is null or empty string');
          this._viewModel = buildUccViewModel(null);
          console.groupEnd();
          return;
        }

        let parsedData = res;
        if (typeof res === 'string') {
          try {
            parsedData = JSON.parse(res);
            this.rawJsonDebugString = JSON.stringify(parsedData, null, 2);
            console.log('Successfully JSON.parsed string to Object:', parsedData);
          } catch (e) {
            console.error('JSON.parse failed on response string:', e);
            this._error = 'UCC data could not be parsed: ' + e.message;
            console.groupEnd();
            return;
          }
        } else {
          this.rawJsonDebugString = JSON.stringify(res, null, 2);
        }

        if (Array.isArray(parsedData)) {
          console.log('Response is an array, unwrapping first element');
          parsedData = parsedData[0] ?? null;
        }

        this._viewModel = buildUccViewModel(parsedData);
        console.groupEnd();
      })
      .catch((err) => {
        console.error('[detailUcc] Apex Error in getUccFilings:', err);
        this._error = err?.body?.message || err?.message || 'Failed to load UCC filings.';
      })
      .finally(() => {
        this._isLoading = false;
        this._uccLoaded = true;
        console.log('%c[detailUcc] State after load:', 'color: #4b5563; font-weight: bold;', {
          showFilings: this.showFilings,
          totalFilings: this.totalFilings,
          businessName: this.businessName,
          filingsCount: this.filings.length,
          showEmptyState: this.showEmptyState,
          hasError: this.hasError
        });
      });
  }

  // ─── Template Getters ───
  get isLoading() {
    return this._isLoading;
  }
  get uccIsLoading() {
    return this._isLoading;
  }

  get hasError() {
    return !!this._error;
  }
  get uccHasError() {
    return !!this._error;
  }

  get error() {
    return this._error;
  }
  get uccError() {
    return this._error;
  }

  get totalFilings() {
    return this._viewModel?.totalFilings ?? 0;
  }
  get uccTotalFilings() {
    return this.totalFilings;
  }

  get businessName() {
    return this._viewModel?.businessName || null;
  }
  get uccBusinessName() {
    return this.businessName;
  }

  get hasBusinessName() {
    return !!this.businessName;
  }
  get uccHasBusinessName() {
    return this.hasBusinessName;
  }

  get filingsLabel() {
    const count = this.totalFilings;
    return `${count} filing${count === 1 ? '' : 's'}`;
  }
  get uccFilingsLabel() {
    return this.filingsLabel;
  }

  get filings() {
    return this._viewModel?.filings || [];
  }
  get uccFilings() {
    return this.filings;
  }

  get showFilings() {
    const shouldShow = this._uccLoaded && !this._isLoading && !this.hasError && this.filings.length > 0;
    return shouldShow;
  }
  get uccShowFilings() {
    return this.showFilings;
  }

  get showEmptyState() {
    return this._uccLoaded && !this._isLoading && !this.hasError && this.filings.length === 0;
  }
  get uccShowEmptyState() {
    return this.showEmptyState;
  }
}
import { LightningElement, api, track } from 'lwc';
import getUccFilings from '@salesforce/apex/CompanyDetailController.getUccFilings';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';

// In-Memory Module Level Cache across tab switches
const uccCache = new Map();

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
  if (!raw) {
    return {
      totalFilings: 0,
      businessName: null,
      hasFilings: false,
      filings: []
    };
  }

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

  const businessName =
    raw.business?.name ||
    raw.companyName ||
    raw.businessName ||
    raw.company_name ||
    null;

  const totalFilings =
    raw.totalFilings !== undefined && raw.totalFilings !== null
      ? raw.totalFilings
      : rawFilings.length;

  const sorted = [...rawFilings].sort((a, b) => {
    const ta = new Date(a.filedDate || a.filingDate || 0).getTime();
    const tb = new Date(b.filedDate || b.filingDate || 0).getTime();
    return tb - ta;
  });

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

  return {
    totalFilings,
    businessName,
    hasFilings: filings.length > 0,
    filings
  };
}

export default class DetailUcc extends LightningElement {
  _companyId;
  _isConnected = false;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const hasChanged = this._companyId !== value;
    this._companyId = value;
    if (value && hasChanged && this._isConnected) {
      this.loadUccData();
      this.fetchCompanyDetails();
    }
  }

  @api companyName;

  @track _dynamicCompanyName = '';
  @track _viewModel = null;
  @track _isLoading = false;
  @track _error = null;
  @track _uccLoaded = false;

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.loadUccData();
      this.fetchCompanyDetails();
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
  }

  fetchCompanyDetails() {
    if (!this._companyId) return;
    getCompany({ companyId: this._companyId })
      .then((res) => {
        if (!res) return;
        const comp = typeof res === 'string' ? JSON.parse(res) : res;
        this._dynamicCompanyName = comp.name || comp.Name || '';
      })
      .catch((e) => {
        console.warn('Could not fetch company info:', e);
      });
  }

  loadUccData(forceRefresh = false) {
    if (!this._companyId) {
      this._isLoading = false;
      return;
    }

    if (!forceRefresh && uccCache.has(this._companyId)) {
      this._viewModel = uccCache.get(this._companyId);
      this._error = null;
      this._isLoading = false;
      this._uccLoaded = true;
      return;
    }

    this._isLoading = true;
    this._error = null;

    getUccFilings({ companyId: this._companyId })
      .then((res) => {
        if (!res) {
          this._viewModel = buildUccViewModel(null);
          uccCache.set(this._companyId, this._viewModel);
          return;
        }

        let parsedData = res;
        if (typeof res === 'string') {
          try {
            parsedData = JSON.parse(res);
          } catch (e) {
            this._error = 'UCC data could not be parsed: ' + e.message;
            return;
          }
        }

        if (Array.isArray(parsedData)) {
          parsedData = parsedData[0] ?? null;
        }

        this._viewModel = buildUccViewModel(parsedData);
        uccCache.set(this._companyId, this._viewModel);
      })
      .catch((err) => {
        this._error = err?.body?.message || err?.message || 'Failed to load UCC filings.';
      })
      .finally(() => {
        this._isLoading = false;
        this._uccLoaded = true;
      });
  }

  // ─── Template Getters ───

  get displayCompanyName() {
    return this.companyName || this._dynamicCompanyName || 'Company';
  }

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
    return this._uccLoaded && !this._isLoading && !this.hasError && this.filings.length > 0;
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
import { LightningElement, api, track } from 'lwc';
import getVerticalIqData from '@salesforce/apex/CompanyDetailController.getVerticalIqData';

export default class DetailRma extends LightningElement {
  @api companyId;

  @track naicsCode = '';
  @track viewModel = null;
  @track isLoading = false;
  @track error = null;
  @track loaded = false;

  connectedCallback() {
    this.loadRmaData();
  }

  loadRmaData(naicsToUse) {
    if (!this.companyId || this.isLoading) return;
    this.isLoading = true;
    this.error = null;

    getVerticalIqData({
      companyId: this.companyId,
      naicsCode: naicsToUse || this.naicsCode || ''
    })
      .then((json) => {
        const raw = typeof json === 'string' ? JSON.parse(json) : json;
        this.viewModel = this.buildRmaViewModel(raw);
        if (this.viewModel.naicsCode && this.viewModel.naicsCode !== 'N/A') {
          this.naicsCode = this.viewModel.naicsCode;
        }
        this.loaded = true;
      })
      .catch((err) => {
        this.error = err?.body?.message || err?.message || 'Failed to load RMA data.';
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  buildRmaViewModel(root) {
    if (!root) return {};
    const data = root.data || root;

    const rawBenchmarks = data.financialBenchmarks || [];
    const benchmarks = rawBenchmarks.map((b, i) => ({
      id: `bm-${i}`,
      classLabel: b.className || b.classLabel || `Class ${i + 1}`,
      currentRatio: b.currentRatio ?? '—',
      quickRatio: b.quickRatio ?? '—',
      grossMargin: b.grossMargin ? `${b.grossMargin}%` : (b.grossMarginPct ?? '—'),
      netMargin: b.netMargin ? `${b.netMargin}%` : (b.netMarginPct ?? '—'),
      daysRecv: b.daysRecv ?? b.daysReceivable ?? '—',
      daysPayable: b.daysPayable ?? '—',
      daysInv: b.daysInv ?? b.daysInventory ?? '—',
      debtEquity: b.debtEquity ?? b.debtToEquity ?? '—',
      roa: b.roa ? `${b.roa}%` : '—',
      roe: b.roe ? `${b.roe}%` : '—'
    }));

    const metricsObj = data.industryMetrics || data.metrics || null;
    const industryMetrics = metricsObj
      ? {
          employeeCount: metricsObj.employeeCount || metricsObj.employees || '—',
          revenue: metricsObj.revenue || metricsObj.industryRevenue || '—',
          size: metricsObj.size || metricsObj.establishments || '—',
          failureRate: metricsObj.failureRate || '—'
        }
      : null;

    const opsObj = data.operations || data.workingCapital || null;
    const profitDrivers = (opsObj?.profitDrivers || data.profitDrivers || []).map((d, i) => ({
      id: `pd-${i}`,
      title: d.title || d.name,
      body: d.body || d.description || d.text
    }));
    const cashMgmtChallenges = (opsObj?.cashMgmtChallenges || opsObj?.cashManagementChallenges || data.cashMgmtChallenges || []).map((c, i) => ({
      id: `cmc-${i}`,
      title: c.title || c.name,
      body: c.body || c.description || c.text
    }));

    return {
      industryName: data.industryName || 'Unknown Industry',
      naicsCode: data.naicsCode || 'N/A',
      industryId: data.industryId || null,
      benchmarks,
      hasBenchmarks: benchmarks.length > 0,
      industryMetrics,
      hasIndustryMetrics: !!industryMetrics,
      profitDrivers,
      hasProfitDrivers: profitDrivers.length > 0,
      cashMgmtChallenges,
      hasCashMgmtChallenges: cashMgmtChallenges.length > 0,
      hasOperations: profitDrivers.length > 0 || cashMgmtChallenges.length > 0
    };
  }

  handleNaicsChange(event) {
    this.naicsCode = event.target.value;
  }

  handleNaicsKeydown(event) {
    if (event.key === 'Enter' && !this.reloadDisabled) {
      this.handleReload();
    }
  }

  handleReload() {
    this.loadRmaData(this.naicsCode);
  }

  get showData() {
    return this.loaded && !this.isLoading && !!this.viewModel;
  }

  get showEmptyState() {
    return this.loaded && !this.isLoading && !this.hasError && !this.viewModel;
  }

  get hasError() {
    return !!this.error;
  }

  get reloadDisabled() {
    return this.isLoading || !this.naicsCode || !this.naicsCode.trim();
  }

  get industryName() {
    return this.viewModel?.industryName || '';
  }

  get naicsDisplay() {
    return this.viewModel?.naicsCode && this.viewModel.naicsCode !== 'N/A'
      ? this.viewModel.naicsCode
      : null;
  }

  get industryId() {
    return this.viewModel?.industryId || null;
  }

  get benchmarks() {
    return this.viewModel?.benchmarks || [];
  }

  get hasBenchmarks() {
    return !!this.viewModel?.hasBenchmarks;
  }

  get benchmarksCount() {
    return this.benchmarks.length;
  }

  get industryMetrics() {
    return this.viewModel?.industryMetrics;
  }

  get hasIndustryMetrics() {
    return !!this.viewModel?.hasIndustryMetrics;
  }

  get hasOperations() {
    return !!this.viewModel?.hasOperations;
  }

  get profitDrivers() {
    return this.viewModel?.profitDrivers || [];
  }

  get hasProfitDrivers() {
    return !!this.viewModel?.hasProfitDrivers;
  }

  get profitDriversCount() {
    return this.profitDrivers.length;
  }

  get cashMgmtChallenges() {
    return this.viewModel?.cashMgmtChallenges || [];
  }

  get hasCashMgmtChallenges() {
    return !!this.viewModel?.hasCashMgmtChallenges;
  }

  get cashMgmtChallengesCount() {
    return this.cashMgmtChallenges.length;
  }
}
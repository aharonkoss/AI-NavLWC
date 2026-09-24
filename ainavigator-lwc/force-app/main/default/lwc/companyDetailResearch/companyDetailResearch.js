import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getTabPdfDownloadUrl from '@salesforce/apex/CompanyDetailController.getTabPdfDownloadUrl';

const RESEARCH_SUBTABS = [
  { id: 'researchLibrary', label: 'Research Library' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'ucc', label: 'UCC' }
];

export default class CompanyDetailResearch extends LightningElement {
  _companyId;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    this._companyId = value ? String(value).trim() : value;
  }

  @track activeResearchSection = 'researchLibrary';
  @track isDownloadingPdf = false;

  // Track optional tabs (RMA & Equifax) if clicked
  @track visitedTabs = {
    rma: false,
    equifax: false
  };

  get researchSubTabs() {
    return RESEARCH_SUBTABS.map((tab) => ({
      ...tab,
      cssClass: `cdr-subtab-btn${
        this.activeResearchSection === tab.id ? ' cdr-subtab-btn--active' : ''
      }`
    }));
  }

  // Active tab state getters
  get isResearchLibraryTab() {
    return this.activeResearchSection === 'researchLibrary';
  }
  get isLeadershipTab() {
    return this.activeResearchSection === 'leadership';
  }
  get isUccTab() {
    return this.activeResearchSection === 'ucc';
  }
  get isRmaTab() {
    return this.activeResearchSection === 'rma';
  }
  get isEquifaxTab() {
    return this.activeResearchSection === 'equifax';
  }

  // Visibility class getters — keeps child components mounted & running
  get researchLibraryTabClass() {
    return `cdr-tab-pane ${this.isResearchLibraryTab ? 'cdr-tab-pane--active' : 'cdr-hidden'}`;
  }
  get leadershipTabClass() {
    return `cdr-tab-pane ${this.isLeadershipTab ? 'cdr-tab-pane--active' : 'cdr-hidden'}`;
  }
  get uccTabClass() {
    return `cdr-tab-pane ${this.isUccTab ? 'cdr-tab-pane--active' : 'cdr-hidden'}`;
  }
  get rmaTabClass() {
    return `cdr-tab-pane ${this.isRmaTab ? 'cdr-tab-pane--active' : 'cdr-hidden'}`;
  }
  get equifaxTabClass() {
    return `cdr-tab-pane ${this.isEquifaxTab ? 'cdr-tab-pane--active' : 'cdr-hidden'}`;
  }

  // Show Download PDF button for Research Library, Leadership, and UCC
  get showDownloadPdfButton() {
    return this.isResearchLibraryTab || this.isLeadershipTab || this.isUccTab;
  }

  handleSubTabChange(event) {
    if (event && event.currentTarget && event.currentTarget.dataset) {
      const selectedTab = event.currentTarget.dataset.id;
      this.activeResearchSection = selectedTab;

      if (this.visitedTabs[selectedTab] === false) {
        this.visitedTabs = {
          ...this.visitedTabs,
          [selectedTab]: true
        };
      }
    }
  }

  handleDownloadPdf() {
    if (!this._companyId || this.isDownloadingPdf) return;

    this.isDownloadingPdf = true;

    getTabPdfDownloadUrl({
      companyId: this._companyId,
      tabName: this.activeResearchSection
    })
      .then((json) => {
        if (!json) {
          throw new Error('No PDF URL was returned by the server.');
        }

        const data = typeof json === 'string' ? JSON.parse(json) : json;

        if (data.downloadUrl) {
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.download = data.fileName || 'report.pdf';
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          throw new Error('PDF download URL was not found in the response.');
        }
      })
      .catch((err) => {
        const errorMsg = err?.body?.message || err?.message || 'Failed to download PDF.';
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
}
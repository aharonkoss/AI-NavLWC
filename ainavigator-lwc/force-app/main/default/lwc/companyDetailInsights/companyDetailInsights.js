import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getInsights from '@salesforce/apex/CompanyDetailController.getInsights';
import getTabPdfDownloadUrl from '@salesforce/apex/CompanyDetailController.getTabPdfDownloadUrl';
import createNote from '@salesforce/apex/CompanyDetailController.createNote';

const CATEGORY_CLASSES = {
  Actionable: 'cdi-badge cdi-badge-green',
  Strategic: 'cdi-badge cdi-badge-purple',
  Relational: 'cdi-badge cdi-badge-orange'
};
const PRIORITY_CLASSES = {
  High: 'cdi-badge cdi-badge-red',
  Medium: 'cdi-badge cdi-badge-yellow',
  Low: 'cdi-badge cdi-badge-gray'
};

export default class CompanyDetailInsights extends LightningElement {
  _companyId;
  _isConnected = false;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const isChanged = this._companyId !== value;
    this._companyId = value;
    if (value && isChanged && this._isConnected) {
      this.loadInsights();
    }
  }

  @api company;
  @api companyName;

  @track insightsData = null;
  @track isLoading = true;
  @track error = null;
  @track isDownloadingPdf = false;
  @track notes = [];

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.loadInsights();
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
  }

  // ─── 1. Load Insights ───
  loadInsights() {
    if (!this._companyId) {
      this.isLoading = false;
      return;
    }
    this.isLoading = true;
    this.error = null;

    getInsights({ companyId: this._companyId })
      .then((json) => {
        this.insightsData = typeof json === 'string' ? JSON.parse(json) : json;
      })
      .catch((err) => {
        console.error('[Insights] Load error:', err);
        this.error = err?.body?.message || 'Failed to load insights.';
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  // ─── 2. PDF Download ───
  handleDownloadPdf() {
    if (!this._companyId || this.isDownloadingPdf) return;

    this.isDownloadingPdf = true;

    getTabPdfDownloadUrl({ companyId: this._companyId, tabName: 'insights' })
      .then((json) => {
        if (!json) throw new Error('No download URL returned.');
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const downloadUrl = data.downloadUrl || data.url || data.pdfUrl;

        if (downloadUrl) {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = data.fileName || 'discovery_call_insights.pdf';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          throw new Error('Download URL not found in response.');
        }
      })
      .catch((err) => {
        const errorMsg = err?.body?.message || err?.message || 'Failed to download Insights PDF.';
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

  // ─── 3. Section Note Actions ───
  handleAddCompanyProfileToNotes() {
    if (!this.companyProfile) return;
    const textLines = [];
    if (this.companyProfile.businessType) {
      textLines.push(`Business Type: ${this.companyProfile.businessType}`);
    }
    if (this.companyProfile.keyCharacteristics) {
      textLines.push(`Key Characteristics: ${this.companyProfile.keyCharacteristics}`);
    }

    this.saveSectionNoteToApi('Company Profile', 'Company Profile', textLines.join('\n\n'));
  }

  handleAddCallStrategyToNotes() {
    if (!this.callStrategy) return;
    const textLines = [];
    if (this.callStrategy.primaryObjective) {
      textLines.push(`Primary Objective:\n${this.callStrategy.primaryObjective}`);
    }
    if (this.callStrategy.keyFocusAreas && this.callStrategy.keyFocusAreas.length > 0) {
      textLines.push(`Key Focus Areas:\n${this.callStrategy.keyFocusAreas.map((k) => '• ' + k).join('\n')}`);
    }
    if (this.callStrategy.relationshipApproach) {
      textLines.push(`Relationship Approach:\n${this.callStrategy.relationshipApproach}`);
    }
    if (this.callStrategy.followUpActions && this.callStrategy.followUpActions.length > 0) {
      textLines.push(`Follow-up Actions:\n${this.callStrategy.followUpActions.map((f) => '• ' + f).join('\n')}`);
    }

    this.saveSectionNoteToApi('Call Strategy', 'Call Strategy', textLines.join('\n\n'));
  }

  handleAddInsightToNotes(event) {
    const title = event.currentTarget.dataset.title;
    const insightObj = this.rawInsights.find((i) => i.title === title);
    if (!insightObj) return;

    const textLines = [];
    if (insightObj.rawDataTrigger) textLines.push(`Data Trigger: ${insightObj.rawDataTrigger}`);
    if (insightObj.insight) textLines.push(insightObj.insight);
    if (insightObj.businessNeed) textLines.push(`Business Need: ${insightObj.businessNeed}`);
    if (insightObj.discoveryQuestions?.length > 0) {
      textLines.push(`Discovery Questions:\n` + insightObj.discoveryQuestions.map((q) => `• ${q}`).join('\n'));
    }
    if (insightObj.rationale) textLines.push(`Rationale: ${insightObj.rationale}`);
    if (insightObj.advisoryOpportunity) textLines.push(`Advisory Opportunity:\n${insightObj.advisoryOpportunity}`);
    if (insightObj.expectedOutcome) textLines.push(`Expected Outcome:\n${insightObj.expectedOutcome}`);

    this.saveSectionNoteToApi(title, title, textLines.join('\n\n'));
  }

  // ─── 4. Select-All Action: Add All Strategic Insights ───
  async handleAddAllInsightsToNotes() {
    const notesWin = this.template.querySelector('c-notes-window');
    if (this.allInsightsInNotes) {
      if (notesWin) notesWin.openDrawer();
      return;
    }

    const unadded = this.rawInsights.filter(
      (i) => !this.notes.some((n) => n.sourceSection === i.title || n.title === i.title)
    );

    for (const insightObj of unadded) {
      const textLines = [];
      if (insightObj.rawDataTrigger) textLines.push(`Data Trigger: ${insightObj.rawDataTrigger}`);
      if (insightObj.insight) textLines.push(insightObj.insight);
      if (insightObj.businessNeed) textLines.push(`Business Need: ${insightObj.businessNeed}`);
      if (insightObj.discoveryQuestions?.length > 0) {
        textLines.push(`Discovery Questions:\n` + insightObj.discoveryQuestions.map((q) => `• ${q}`).join('\n'));
      }
      if (insightObj.rationale) textLines.push(`Rationale: ${insightObj.rationale}`);
      if (insightObj.advisoryOpportunity) textLines.push(`Advisory Opportunity:\n${insightObj.advisoryOpportunity}`);
      if (insightObj.expectedOutcome) textLines.push(`Expected Outcome:\n${insightObj.expectedOutcome}`);

      try {
        await createNote({
          companyId: this._companyId,
          title: insightObj.title,
          content: textLines.join('\n\n'),
          sourceTab: 'Discovery Call Insights',
          sourceSection: insightObj.title
        });
      } catch (err) {
        console.error('Error batch adding insight note:', err);
      }
    }

    if (notesWin) {
      notesWin.openDrawer();
      notesWin.refreshNotes();
    }
  }

  saveSectionNoteToApi(title, sourceSection, content) {
    const existing = this.notes.find((n) => n.sourceSection === sourceSection || n.title === title);
    const notesWin = this.template.querySelector('c-notes-window');

    if (existing) {
      if (notesWin) notesWin.openDrawer();
      return;
    }

    createNote({
      companyId: this._companyId,
      title: title,
      content: content,
      sourceTab: 'Discovery Call Insights',
      sourceSection: sourceSection
    })
      .then(() => {
        if (notesWin) {
          notesWin.openDrawer();
          notesWin.refreshNotes();
        }
      })
      .catch((err) => {
        const errorMsg = err?.body?.message || err?.message || 'Could not save section note.';
        console.error('[Notes API] createNote error:', err);
        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Error Saving Note',
            message: errorMsg,
            variant: 'error'
          })
        );
      });
  }

  // ─── 5. Reactive Checkmark Updates from <c-notes-window> ───
  handleNotesUpdated(event) {
    this.notes = event.detail.notes || [];
  }

  // ─── Template Getters ───
  get plan() {
    return this.insightsData?.discoveryCallPlan;
  }
  get companyProfile() {
    return this.plan?.companyProfile;
  }
  get callStrategy() {
    return this.plan?.callStrategy;
  }
  get rawInsights() {
    return this.plan?.insights || [];
  }

  get isCompanyProfileInNotes() {
    return this.notes.some(
      (n) => n.sourceSection === 'Company Profile' || n.title === 'Company Profile'
    );
  }
  get companyProfileBtnClass() {
    return this.isCompanyProfileInNotes
      ? 'cdi-action-btn cdi-btn-checked'
      : 'cdi-action-btn cdi-btn-plus';
  }
  get companyProfileBtnTitle() {
    return this.isCompanyProfileInNotes ? 'Added to notes' : 'Add to notes';
  }

  get isCallStrategyInNotes() {
    return this.notes.some(
      (n) => n.sourceSection === 'Call Strategy' || n.title === 'Call Strategy'
    );
  }
  get callStrategyBtnClass() {
    return this.isCallStrategyInNotes
      ? 'cdi-action-btn cdi-btn-checked'
      : 'cdi-action-btn cdi-btn-plus';
  }
  get callStrategyBtnTitle() {
    return this.isCallStrategyInNotes ? 'Added to notes' : 'Add to notes';
  }

  get hasKeyFocusAreas() {
    return Array.isArray(this.callStrategy?.keyFocusAreas) && this.callStrategy.keyFocusAreas.length > 0;
  }

  get hasFollowUpActions() {
    return Array.isArray(this.callStrategy?.followUpActions) && this.callStrategy.followUpActions.length > 0;
  }

  get strategicInsightsHeading() {
    const count = this.rawInsights.length;
    return `Strategic Insights (${count})`;
  }

  get allInsightsInNotes() {
    return this.hasInsights && this.insights.every((i) => i.isAddedToNotes);
  }

  get allInsightsBtnClass() {
    return this.allInsightsInNotes
      ? 'cdi-action-btn cdi-btn-checked'
      : 'cdi-action-btn cdi-btn-plus';
  }

  get allInsightsBtnTitle() {
    return this.allInsightsInNotes
      ? 'All Strategic Insights added to notes'
      : 'Add all Strategic Insights to notes';
  }

  get insights() {
    return this.rawInsights.map((i) => {
      const isAdded = this.notes.some((n) => n.sourceSection === i.title || n.title === i.title);
      return {
        ...i,
        categoryClass: CATEGORY_CLASSES[i.category] || 'cdi-badge cdi-badge-gray',
        priorityClass: PRIORITY_CLASSES[i.priority] || 'cdi-badge cdi-badge-gray',
        hasQuestions: Array.isArray(i.discoveryQuestions) && i.discoveryQuestions.length > 0,
        isAddedToNotes: isAdded,
        noteBtnClass: isAdded
          ? 'cdi-action-btn cdi-btn-checked'
          : 'cdi-action-btn cdi-btn-plus',
        noteBtnTitle: isAdded ? 'Added to notes' : 'Add to notes'
      };
    });
  }

  get hasInsights() {
    return this.insights.length > 0;
  }

  get companyDisplayName() {
    return this.companyName || this.company?.Name || this.company?.name || 'Selected Company';
  }
}
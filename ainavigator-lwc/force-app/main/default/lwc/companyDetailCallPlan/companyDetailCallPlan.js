import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCallPlan from '@salesforce/apex/CompanyDetailController.getCallPlan';
import getTabPdfDownloadUrl from '@salesforce/apex/CompanyDetailController.getTabPdfDownloadUrl';
import createNote from '@salesforce/apex/CompanyDetailController.createNote';

const SHORT_LABELS = ['Build Trust', 'Frame', 'Explore Needs', 'Stories', 'Commit'];

// Helper to safely extract string text from strings or structured objects
function extractItemText(item) {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    const label = item.topic || item.title || item.header || '';
    const body = item.point || item.text || item.description || item.detail || item.content || item.value || '';

    if (label && body && label !== body) {
      return `${label}: ${body}`;
    }
    if (body) return body;
    if (label) return label;

    const values = Object.values(item).filter((v) => typeof v === 'string' && v.trim().length > 0);
    if (values.length > 0) {
      return values.join(' - ');
    }
  }
  return String(item);
}

export default class CompanyDetailCallPlan extends LightningElement {
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
      this.loadCallPlan();
    }
  }

  @api company;
  @api companyName;

  @track callPlanData = null;
  @track isLoading = true;
  @track error = null;
  @track activeIndex = 0;
  @track isDownloading = false;
  @track notes = [];

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.loadCallPlan();
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
  }

  // ─── 1. Load Call Plan ───
  loadCallPlan() {
    if (!this._companyId) {
      this.isLoading = false;
      return;
    }
    this.isLoading = true;
    this.error = null;

    getCallPlan({ companyId: this._companyId })
      .then((json) => {
        this.callPlanData = typeof json === 'string' ? JSON.parse(json) : json;
      })
      .catch((err) => {
        console.error('[CallPlan] Load error:', err);
        this.error = err?.body?.message || 'Failed to load call plan.';
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  // ─── 2. PDF Download Handler ───
  @api
  handleDownloadPDF() {
    if (!this._companyId || this.isDownloading) return;

    this.isDownloading = true;

    getTabPdfDownloadUrl({
      companyId: this._companyId,
      tabName: 'discovery-call-plan'
    })
      .then((json) => {
        if (!json) throw new Error('No download URL returned.');
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const downloadUrl = data.downloadUrl || data.url || data.pdfUrl;

        if (downloadUrl) {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = data.fileName || 'discovery_call_plan.pdf';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          throw new Error('PDF download URL was not found in response.');
        }
      })
      .catch((err) => {
        const errorMsg = err?.body?.message || err?.message || 'Failed to download Call Plan PDF.';
        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Download Error',
            message: errorMsg,
            variant: 'error'
          })
        );
      })
      .finally(() => {
        this.isDownloading = false;
      });
  }

  // ─── 3. Section "+" Button Handlers ───
  handleAddObjectiveToNotes() {
    if (!this.callPlan?.callObjective) return;
    this.saveSectionNoteToApi('Call Objective', 'Call Objective', this.callPlan.callObjective);
  }

  handleAddPrepToNotes() {
    if (!this.callPlan?.preCallPreparation || this.callPlan.preCallPreparation.length === 0) return;
    const text = this.callPlan.preCallPreparation.map((item) => `• ${item}`).join('\n\n');
    this.saveSectionNoteToApi('Pre-Call Preparation', 'Pre-Call Preparation', text);
  }

  handleAddOpeningToNotes() {
    if (!this.callPlan?.openingStatement) return;
    this.saveSectionNoteToApi('Opening Statement', 'Opening Statement', this.callPlan.openingStatement);
  }

  handleAddTalkingPointsToNotes() {
    if (!this.callPlan?.keyTalkingPoints || this.callPlan.keyTalkingPoints.length === 0) return;
    const text = this.callPlan.keyTalkingPoints.map((point) => `• ${point}`).join('\n\n');
    this.saveSectionNoteToApi('Key Talking Points', 'Key Talking Points', text);
  }

  handleAddActiveStepToNotes() {
    const step = this.activeStep;
    if (!step || !step.step) return;

    const lines = [];
    lines.push(`Step: ${step.step}`);
    if (step.description) lines.push(`Description: ${step.description}`);

    if (step.stMeyerKnowledge?.content?.length > 0) {
      lines.push(
        `\n${step.stMeyerKnowledge.title || 'Knowledge'}:\n` +
          step.stMeyerKnowledge.content.map((k) => `• ${extractItemText(k)}`).join('\n')
      );
    }
    if (step.companyInfo?.content?.length > 0) {
      lines.push(
        `\n${step.companyInfo.title || 'Company Info'}:\n` +
          step.companyInfo.content.map((c) => `• ${extractItemText(c)}`).join('\n')
      );
    }
    if (step.questions?.length > 0) {
      lines.push(`\nDiscovery Questions:\n` + step.questions.map((q) => `${q.num}. ${q.text}`).join('\n'));
    }

    this.saveSectionNoteToApi(step.step, step.step, lines.join('\n'));
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
      sourceTab: 'Discovery Call Plan',
      sourceSection: sourceSection
    })
      .then(() => {
        if (notesWin) {
          notesWin.openDrawer();
          notesWin.refreshNotes();
        }
      })
      .catch((err) => {
        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Error Saving Note',
            message: err?.body?.message || err?.message || 'Could not save section note.',
            variant: 'error'
          })
        );
      });
  }

  // ─── 4. Reactive Updates from Child Component ───
  handleNotesUpdated(event) {
    this.notes = event.detail.notes || [];
  }

  // ─── Stepper Controls ───
  handleStepClick(event) {
    this.activeIndex = parseInt(event.currentTarget.dataset.index, 10);
  }
  handlePrev() {
    if (!this.isPrevDisabled) this.activeIndex -= 1;
  }
  handleNext() {
    if (!this.isNextDisabled) this.activeIndex += 1;
  }

  // ─── Template Getters ───
  get callPlan() {
    const raw = this.callPlanData?.callPlan || {};

    const keyTalkingPoints = Array.isArray(raw.keyTalkingPoints)
      ? raw.keyTalkingPoints.map(extractItemText).filter(Boolean)
      : [];
    const preCallPreparation = Array.isArray(raw.preCallPreparation)
      ? raw.preCallPreparation.map(extractItemText).filter(Boolean)
      : [];

    return {
      ...raw,
      keyTalkingPoints,
      preCallPreparation
    };
  }

  get _framework() {
    return this.callPlan.discoveryFramework || [];
  }

  get hasSteps() {
    return this._framework.length > 0;
  }

  get steps() {
    return this._framework.map((s, i) => ({
      ...s,
      index: i,
      shortLabel: SHORT_LABELS[i] || `Step ${i + 1}`,
      navClass: i === this.activeIndex ? 'cdcp-step-btn cdcp-step-btn-active' : 'cdcp-step-btn',
      dotClass: i === this.activeIndex ? 'cdcp-dot cdcp-dot-active' : 'cdcp-dot'
    }));
  }

  get activeStep() {
    const s = this._framework[this.activeIndex] || {};
    const rawQuestions = s.questions || [];
    const questions = rawQuestions.map((q, i) => ({
      key: `q-${i}`,
      num: i + 1,
      text: extractItemText(q)
    }));

    const rawKnowledge = s.stMeyerKnowledge?.content || [];
    const rawCompanyInfo = s.companyInfo?.content || [];

    return {
      ...s,
      stMeyerKnowledge: {
        title: s.stMeyerKnowledge?.title || 'Knowledge',
        content: rawKnowledge.map(extractItemText)
      },
      companyInfo: {
        title: s.companyInfo?.title || 'Company Info',
        content: rawCompanyInfo.map(extractItemText)
      },
      questions
    };
  }

  get isPrevDisabled() {
    return this.activeIndex === 0;
  }
  get isNextDisabled() {
    return this.activeIndex >= this._framework.length - 1;
  }

  get hasTalkingPoints() {
    return Array.isArray(this.callPlan?.keyTalkingPoints) && this.callPlan.keyTalkingPoints.length > 0;
  }

  // ─── Section Checkmarks ───
  get isObjectiveInNotes() {
    return this.notes.some((n) => n.sourceSection === 'Call Objective' || n.title === 'Call Objective');
  }

  get isPrepInNotes() {
    return this.notes.some((n) => n.sourceSection === 'Pre-Call Preparation' || n.title === 'Pre-Call Preparation');
  }

  get isOpeningInNotes() {
    return this.notes.some((n) => n.sourceSection === 'Opening Statement' || n.title === 'Opening Statement');
  }

  get isTalkingPointsInNotes() {
    return this.notes.some((n) => n.sourceSection === 'Key Talking Points' || n.title === 'Key Talking Points');
  }

  get isActiveStepInNotes() {
    const stepName = this.activeStep?.step;
    return !!stepName && this.notes.some((n) => n.sourceSection === stepName || n.title === stepName);
  }

  get companyDisplayName() {
    return this.companyName || this.company?.Name || this.company?.name || 'Selected Company';
  }
}
import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCallPlan from '@salesforce/apex/CompanyDetailController.getCallPlan';
import getTabPdfDownloadUrl from '@salesforce/apex/CompanyDetailController.getTabPdfDownloadUrl';
import getNotes from '@salesforce/apex/CompanyDetailController.getNotes';
import createNote from '@salesforce/apex/CompanyDetailController.createNote';
import updateNote from '@salesforce/apex/CompanyDetailController.updateNote';
import deleteNote from '@salesforce/apex/CompanyDetailController.deleteNote';

const SHORT_LABELS = ['Build Trust', 'Frame', 'Explore Needs', 'Stories', 'Commit'];

function formatTimestamp(d) {
    if (!d) return '';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return d;
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return d;
    }
}

export default class CompanyDetailCallPlan extends LightningElement {
    _companyId;

    @api
    get companyId() {
        return this._companyId;
    }
    set companyId(value) {
        const isChanged = this._companyId !== value;
        this._companyId = value;
        if (value && isChanged) {
            this.loadCallPlan();
            this.fetchNotes();
        }
    }

    @api company;

    @track callPlanData = null;
    @track isLoading = true;
    @track error = null;
    @track activeIndex = 0;
    @track isDownloading = false;

    // ─── Notes State ───
    @track isNotesDrawerOpen = false;
    @track notes = [];
    @track isLoadingNotes = false;
    @track isSavingNote = false;
    @track isEditingNote = false;
    @track currentNoteId = null;
    @track currentNoteTitle = '';
    @track currentNoteContent = '';
    @track currentSourceTab = 'Discovery Call Plan';
    @track currentSourceSection = '';

    connectedCallback() {
        if (this._companyId) {
            this.loadCallPlan();
            this.fetchNotes();
        }
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
            .then(json => {
                this.callPlanData = typeof json === 'string' ? JSON.parse(json) : json;
            })
            .catch(err => {
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
            .then(json => {
                if (!json) throw new Error('No download URL returned.');
                const data = typeof json === 'string' ? JSON.parse(json) : json;

                if (data.downloadUrl) {
                    const a = document.createElement('a');
                    a.href = data.downloadUrl;
                    a.download = data.fileName || 'discovery_call_plan.pdf';
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else {
                    throw new Error('PDF download URL was not found in response.');
                }
            })
            .catch(err => {
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

    // ─── 3. Fetch Notes via CompanyDetailController ───
    fetchNotes() {
        if (!this._companyId) return;

        this.isLoadingNotes = true;

        getNotes({ companyId: this._companyId })
            .then(json => {
                const data = typeof json === 'string' ? JSON.parse(json) : json;
                const rawList = Array.isArray(data) ? data : data.notes || [];

                this.notes = rawList.map((n, idx) => {
                    const actualNoteId = n.noteId || n.id || n._id || n.note_id;
                    const sourceTab = n.sourceTab || 'Discovery Call Plan';
                    const sourceSection = n.sourceSection || '';

                    return {
                        id: actualNoteId,
                        title: n.title || sourceSection || 'Untitled Note',
                        content: n.content || '',
                        sourceTab: sourceTab,
                        sourceSection: sourceSection,
                        timestamp: formatTimestamp(n.updatedAt || n.createdAt || new Date()),
                        isUserCreated: !sourceSection || sourceSection === 'Manual',
                        isExpanded: idx === 0
                    };
                });
            })
            .catch(err => {
                console.error('[CallPlan] Notes fetch error:', err);
            })
            .finally(() => {
                this.isLoadingNotes = false;
            });
    }

    // ─── 4. Section "+" Button Handlers (Auto-Save Section Note via API) ───
    handleAddObjectiveToNotes() {
        if (!this.callPlan?.callObjective) return;
        this.saveSectionNoteToApi('Call Objective', 'Call Objective', this.callPlan.callObjective);
    }

    handleAddPrepToNotes() {
        if (!this.callPlan?.preCallPreparation || this.callPlan.preCallPreparation.length === 0) return;
        const text = this.callPlan.preCallPreparation.map(item => `• ${item}`).join('\n\n');
        this.saveSectionNoteToApi('Pre-Call Preparation', 'Pre-Call Preparation', text);
    }

    handleAddOpeningToNotes() {
        if (!this.callPlan?.openingStatement) return;
        this.saveSectionNoteToApi('Opening Statement', 'Opening Statement', this.callPlan.openingStatement);
    }

    handleAddTalkingPointsToNotes() {
        if (!this.callPlan?.keyTalkingPoints || this.callPlan.keyTalkingPoints.length === 0) return;
        const text = this.callPlan.keyTalkingPoints.map(point => `• ${point}`).join('\n\n');
        this.saveSectionNoteToApi('Key Talking Points', 'Key Talking Points', text);
    }

    handleAddActiveStepToNotes() {
        const step = this.activeStep;
        if (!step || !step.step) return;

        const lines = [];
        lines.push(`Step: ${step.step}`);
        if (step.description) lines.push(`Description: ${step.description}`);

        if (step.stMeyerKnowledge?.content?.length > 0) {
            lines.push(`\n${step.stMeyerKnowledge.title || 'Knowledge'}:\n` + step.stMeyerKnowledge.content.map(k => `• ${k}`).join('\n'));
        }
        if (step.companyInfo?.content?.length > 0) {
            lines.push(`\n${step.companyInfo.title || 'Company Info'}:\n` + step.companyInfo.content.map(c => `• ${c}`).join('\n'));
        }
        if (step.questions?.length > 0) {
            lines.push(`\nDiscovery Questions:\n` + step.questions.map(q => `${q.num}. ${q.text}`).join('\n'));
        }

        this.saveSectionNoteToApi(step.step, step.step, lines.join('\n'));
    }

    saveSectionNoteToApi(title, sourceSection, content) {
        // Prevent duplicate creation
        const existing = this.notes.find(n => n.sourceSection === sourceSection || n.title === title);
        if (existing) {
            this.isNotesDrawerOpen = true;
            return;
        }

        createNote({
            companyId: this._companyId,
            title: title,
            content: content,
            sourceTab: 'Discovery Call Plan',
            sourceSection: sourceSection
        })
            .then(json => {
                const res = typeof json === 'string' ? JSON.parse(json) : json;
                const actualNoteId = res.noteId || res.id || res.note?.noteId || res.note?.id || res.data?.noteId;

                const newNote = {
                    id: actualNoteId,
                    title: title,
                    content: content,
                    sourceTab: 'Discovery Call Plan',
                    sourceSection: sourceSection,
                    timestamp: formatTimestamp(new Date()),
                    isUserCreated: false,
                    isExpanded: true
                };

                this.notes = [newNote, ...this.notes];
                this.isNotesDrawerOpen = true;
                this.fetchNotes();
            })
            .catch(err => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error Saving Note',
                        message: err?.body?.message || err?.message || 'Could not save section note.',
                        variant: 'error'
                    })
                );
            });
    }

    // ─── 5. Manual Note Composer ───
    handleToggleNotesDrawer() {
        this.isNotesDrawerOpen = !this.isNotesDrawerOpen;
    }

    handleCloseNotesDrawer() {
        this.isNotesDrawerOpen = false;
        this.isEditingNote = false;
    }

    handleOpenNewNoteForm() {
        this.currentNoteId = null;
        this.currentNoteTitle = '';
        this.currentNoteContent = '';
        this.currentSourceTab = 'Discovery Call Plan';
        this.currentSourceSection = 'Manual';
        this.isEditingNote = true;
    }

    handleCancelNoteEdit() {
        this.isEditingNote = false;
        this.currentNoteId = null;
        this.currentNoteTitle = '';
        this.currentNoteContent = '';
    }

    handleNoteTitleChange(e) {
        this.currentNoteTitle = e.target.value;
    }

    handleNoteContentChange(e) {
        this.currentNoteContent = e.target.value;
    }

    handleFormatBold() {
        this.currentNoteContent = (this.currentNoteContent || '') + '**bold text** ';
    }

    handleFormatItalic() {
        this.currentNoteContent = (this.currentNoteContent || '') + '*italic text* ';
    }

    handleFormatBullet() {
        this.currentNoteContent = (this.currentNoteContent || '') + '\n• ';
    }

    // ─── 6. POST & PUT Handlers ───
    handleSaveNote() {
        if (!this.currentNoteTitle.trim() && !this.currentNoteContent.trim()) {
            this.handleCancelNoteEdit();
            return;
        }

        this.isSavingNote = true;
        const titleToSave = this.currentNoteTitle.trim() || 'Untitled Note';
        const contentToSave = this.currentNoteContent.trim();

        if (this.currentNoteId) {
            // Edit Note (PUT)
            updateNote({
                noteId: this.currentNoteId,
                title: titleToSave,
                content: contentToSave
            })
                .then(() => {
                    this.notes = this.notes.map(n => {
                        if (n.id === this.currentNoteId) {
                            return {
                                ...n,
                                title: titleToSave,
                                content: contentToSave,
                                timestamp: formatTimestamp(new Date())
                            };
                        }
                        return n;
                    });
                    this.handleCancelNoteEdit();
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Success',
                            message: 'Note updated successfully.',
                            variant: 'success'
                        })
                    );
                })
                .catch(err => {
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Error Updating Note',
                            message: err?.body?.message || err?.message || 'Could not update note.',
                            variant: 'error'
                        })
                    );
                })
                .finally(() => {
                    this.isSavingNote = false;
                });
        } else {
            // Create Note (POST)
            createNote({
                companyId: this._companyId,
                title: titleToSave,
                content: contentToSave,
                sourceTab: this.currentSourceTab,
                sourceSection: this.currentSourceSection
            })
                .then(json => {
                    const res = typeof json === 'string' ? JSON.parse(json) : json;
                    const actualNoteId = res.noteId || res.id || res.note?.noteId || res.note?.id || res.data?.noteId;

                    const newNote = {
                        id: actualNoteId,
                        title: titleToSave,
                        content: contentToSave,
                        sourceTab: this.currentSourceTab,
                        sourceSection: this.currentSourceSection,
                        timestamp: formatTimestamp(new Date()),
                        isUserCreated: true,
                        isExpanded: true
                    };

                    this.notes = [newNote, ...this.notes];
                    this.handleCancelNoteEdit();
                    this.fetchNotes();
                })
                .catch(err => {
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Error Creating Note',
                            message: err?.body?.message || err?.message || 'Could not create note.',
                            variant: 'error'
                        })
                    );
                })
                .finally(() => {
                    this.isSavingNote = false;
                });
        }
    }

    handleToggleNoteExpand(event) {
        const id = event.currentTarget.dataset.id;
        this.notes = this.notes.map(n => {
            if (n.id === id) {
                return { ...n, isExpanded: !n.isExpanded };
            }
            return n;
        });
    }

    handleEditNote(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const target = this.notes.find(n => n.id === id);
        if (target) {
            this.currentNoteId = target.id;
            this.currentNoteTitle = target.title;
            this.currentNoteContent = target.content;
            this.currentSourceTab = target.sourceTab || 'Discovery Call Plan';
            this.currentSourceSection = target.sourceSection || 'Manual';
            this.isEditingNote = true;
        }
    }

    handleDeleteNote(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;

        deleteNote({ noteId: id })
            .then(() => {
                this.notes = this.notes.filter(n => n.id !== id);
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Note deleted.',
                        variant: 'success'
                    })
                );
            })
            .catch(err => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error Deleting Note',
                        message: err?.body?.message || err?.message || 'Could not delete note.',
                        variant: 'error'
                    })
                );
            });
    }

    handlePrintNotes() {
        window.print();
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
        return this.callPlanData?.callPlan || {};
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
            navClass: i === this.activeIndex
                ? 'cdcp-step-btn cdcp-step-btn-active'
                : 'cdcp-step-btn',
            dotClass: i === this.activeIndex ? 'cdcp-dot cdcp-dot-active' : 'cdcp-dot'
        }));
    }

    get activeStep() {
        const s = this._framework[this.activeIndex] || {};
        const questions = (s.questions || []).map((q, i) => ({
            key: `q-${i}`,
            num: i + 1,
            text: q
        }));
        return {
            ...s,
            stMeyerKnowledge: s.stMeyerKnowledge || { title: 'Knowledge', content: [] },
            companyInfo: s.companyInfo || { title: 'Company Info', content: [] },
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

    // ─── Filtered Notes & Section Checkers ───
    // Section in Notes Checkers (Drives + vs ✓ based on sourceTab & sourceSection)
    get isObjectiveInNotes() {
        return this.notes.some(n => 
            (n.sourceTab === 'Discovery Call Plan' || n.sourceTab === 'Call Plan' || !n.sourceTab) &&
            (n.sourceSection === 'Call Objective' || n.title === 'Call Objective')
        );
    }

    get isPrepInNotes() {
        return this.notes.some(n => 
            (n.sourceTab === 'Discovery Call Plan' || n.sourceTab === 'Call Plan' || !n.sourceTab) &&
            (n.sourceSection === 'Pre-Call Preparation' || n.title === 'Pre-Call Preparation')
        );
    }

    get isOpeningInNotes() {
        return this.notes.some(n => 
            (n.sourceTab === 'Discovery Call Plan' || n.sourceTab === 'Call Plan' || !n.sourceTab) &&
            (n.sourceSection === 'Opening Statement' || n.title === 'Opening Statement')
        );
    }

    get isTalkingPointsInNotes() {
        return this.notes.some(n => 
            (n.sourceTab === 'Discovery Call Plan' || n.sourceTab === 'Call Plan' || !n.sourceTab) &&
            (n.sourceSection === 'Key Talking Points' || n.title === 'Key Talking Points')
        );
    }

    get isActiveStepInNotes() {
        const stepName = this.activeStep?.step;
        return !!stepName && this.notes.some(n => 
            (n.sourceTab === 'Discovery Call Plan' || n.sourceTab === 'Call Plan' || !n.sourceTab) &&
            (n.sourceSection === stepName || n.title === stepName)
        );
    }

    get companyDisplayName() {
        return this.company?.Name || this.company?.name || 'T & P Fueling Solutions LLP';
    }

    get drawerClass() {
        return `cdcp-notes-drawer ${this.isNotesDrawerOpen ? 'cdcp-drawer-open' : ''}`;
    }

    // Filter notes list by current tab / general notes
    get filteredNotesList() {
        const list = this.notes.filter(n => 
            !n.sourceTab || 
            n.sourceTab === 'Discovery Call Plan' || 
            n.sourceTab === 'Call Plan' || 
            n.sourceTab === 'Manual'
        );
        return list.map(n => ({
            ...n,
            chevronClass: `cdcp-note-chevron ${n.isExpanded ? 'cdcp-chevron-down' : ''}`
        }));
    }

    get notesCount() {
        return this.filteredNotesList.length;
    }

    get hasNotes() {
        return this.filteredNotesList.length > 0;
    }
}
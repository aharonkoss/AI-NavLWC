import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getInsights from '@salesforce/apex/CompanyDetailInsightsController.getInsights';
import getInsightsPdfDownloadUrl from '@salesforce/apex/CompanyDetailInsightsController.getInsightsPdfDownloadUrl';
import getNotes from '@salesforce/apex/CompanyDetailInsightsController.getNotes';
import createNote from '@salesforce/apex/CompanyDetailInsightsController.createNote';
import updateNote from '@salesforce/apex/CompanyDetailInsightsController.updateNote';
import deleteNote from '@salesforce/apex/CompanyDetailInsightsController.deleteNote';

const CATEGORY_CLASSES = {
    'Actionable': 'cdi-badge cdi-badge-green',
    'Strategic':  'cdi-badge cdi-badge-purple',
    'Relational': 'cdi-badge cdi-badge-orange'
};
const PRIORITY_CLASSES = {
    'High':   'cdi-badge cdi-badge-red',
    'Medium': 'cdi-badge cdi-badge-yellow',
    'Low':    'cdi-badge cdi-badge-gray'
};

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

export default class CompanyDetailInsights extends LightningElement {
    _companyId;

    @api
    get companyId() {
        return this._companyId;
    }
    set companyId(value) {
        const isChanged = this._companyId !== value;
        this._companyId = value;
        if (value && isChanged) {
            this.loadInsights();
            this.fetchNotesFromApi();
        }
    }

    @api company;

    @track insightsData = null;
    @track isLoading = true;
    @track error = null;
    @track isDownloadingPdf = false;

    // ─── Notes State ───
    @track isNotesDrawerOpen = false;
    @track notes = [];
    @track isLoadingNotes = false;
    @track isSavingNote = false;
    @track isEditingNote = false;
    @track currentNoteId = null;
    @track currentNoteTitle = '';
    @track currentNoteContent = '';
    @track currentSourceTab = 'Discovery Call Insights';
    @track currentSourceSection = '';

    connectedCallback() {
        if (this._companyId) {
            this.loadInsights();
            this.fetchNotesFromApi();
        }
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
            .then(json => {
                this.insightsData = typeof json === 'string' ? JSON.parse(json) : json;
            })
            .catch(err => {
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

        getInsightsPdfDownloadUrl({ companyId: this._companyId })
            .then(json => {
                if (!json) throw new Error('No download URL returned.');
                const data = typeof json === 'string' ? JSON.parse(json) : json;

                if (data.downloadUrl) {
                    const a = document.createElement('a');
                    a.href = data.downloadUrl;
                    a.download = data.fileName || 'discovery_call_insights.pdf';
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else {
                    throw new Error('Download URL not found in response.');
                }
            })
            .catch(err => {
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

    // ─── 3. GET Notes API ───
    fetchNotesFromApi() {
        if (!this._companyId) return;

        this.isLoadingNotes = true;
        console.log(`%c[Notes API] Fetching notes for companyId: ${this._companyId}`, 'color: #0b5cff; font-weight: bold;');

        getNotes({ companyId: this._companyId })
            .then(json => {
                const data = typeof json === 'string' ? JSON.parse(json) : json;
                console.log('[Notes API] Raw GET notes response:', data);

                const rawList = Array.isArray(data) ? data : data.notes || [];

                this.notes = rawList.map((n, idx) => {
                    const actualNoteId = n.noteId || n.id || n._id || n.note_id;
                    return {
                        id: actualNoteId,
                        title: n.title || n.sourceSection || 'Untitled Note',
                        content: n.content || '',
                        sourceTab: n.sourceTab || 'Discovery Call Insights',
                        sourceSection: n.sourceSection || '',
                        timestamp: formatTimestamp(n.updatedAt || n.createdAt || new Date()),
                        isUserCreated: !n.sourceSection || n.sourceSection === 'Manual',
                        isExpanded: idx === 0
                    };
                });

                console.log(`[Notes API] Mapped ${this.notes.length} notes:`, this.notes);
            })
            .catch(err => {
                console.error('[Notes API] Fetch notes failed:', err);
            })
            .finally(() => {
                this.isLoadingNotes = false;
            });
    }

    // ─── 4. Section "+" Click Handlers ───
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
            textLines.push(`Key Focus Areas:\n${this.callStrategy.keyFocusAreas.map(k => '• ' + k).join('\n')}`);
        }
        if (this.callStrategy.relationshipApproach) {
            textLines.push(`Relationship Approach:\n${this.callStrategy.relationshipApproach}`);
        }
        if (this.callStrategy.followUpActions && this.callStrategy.followUpActions.length > 0) {
            textLines.push(`Follow-up Actions:\n${this.callStrategy.followUpActions.map(f => '• ' + f).join('\n')}`);
        }

        this.saveSectionNoteToApi('Call Strategy', 'Call Strategy', textLines.join('\n\n'));
    }

    handleAddInsightToNotes(event) {
        const title = event.currentTarget.dataset.title;
        const insightObj = this.rawInsights.find(i => i.title === title);
        if (!insightObj) return;

        const textLines = [];
        if (insightObj.rawDataTrigger) textLines.push(`Trigger: ${insightObj.rawDataTrigger}`);
        if (insightObj.insight) textLines.push(insightObj.insight);
        if (insightObj.businessNeed) textLines.push(`Business Need: ${insightObj.businessNeed}`);

        this.saveSectionNoteToApi(title, title, textLines.join('\n\n'));
    }

    saveSectionNoteToApi(title, sourceSection, content) {
        const existing = this.notes.find(n => n.sourceSection === sourceSection || n.title === title);
        if (existing) {
            this.isNotesDrawerOpen = true;
            return;
        }

        createNote({
            companyId: this._companyId,
            title: title,
            content: content,
            sourceTab: 'Discovery Call Insights',
            sourceSection: sourceSection
        })
            .then(json => {
                const res = typeof json === 'string' ? JSON.parse(json) : json;
                console.log('[Notes API] createNote (Section) response:', res);

                const actualNoteId = res.noteId || res.id || res.note?.noteId || res.note?.id || res.data?.noteId;

                const newNote = {
                    id: actualNoteId,
                    title: title,
                    content: content,
                    sourceTab: 'Discovery Call Insights',
                    sourceSection: sourceSection,
                    timestamp: formatTimestamp(new Date()),
                    isUserCreated: false,
                    isExpanded: true
                };

                this.notes = [newNote, ...this.notes];
                this.isNotesDrawerOpen = true;
                // Re-fetch to ensure exact server-side IDs and timestamps
                this.fetchNotesFromApi();
            })
            .catch(err => {
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
        this.currentSourceTab = 'Discovery Call Insights';
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
            // ── PUT /v1/user/notes/{noteId} ──
            console.log(`%c[Notes API] Updating Note (PUT) id: ${this.currentNoteId}`, 'color: #9333ea; font-weight: bold;', {
                title: titleToSave,
                content: contentToSave
            });

            updateNote({
                noteId: this.currentNoteId,
                title: titleToSave,
                content: contentToSave
            })
                .then(res => {
                    console.log('[Notes API] updateNote response:', res);
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
                    const errorMsg = err?.body?.message || err?.message || 'Could not update note.';
                    console.error('[Notes API] updateNote error:', err);
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Error Updating Note',
                            message: errorMsg,
                            variant: 'error'
                        })
                    );
                })
                .finally(() => {
                    this.isSavingNote = false;
                });
        } else {
            // ── POST /v1/user/companies/{companyId}/notes ──
            console.log(`%c[Notes API] Creating Note (POST)`, 'color: #059669; font-weight: bold;', {
                companyId: this._companyId,
                title: titleToSave,
                content: contentToSave
            });

            createNote({
                companyId: this._companyId,
                title: titleToSave,
                content: contentToSave,
                sourceTab: this.currentSourceTab,
                sourceSection: this.currentSourceSection
            })
                .then(json => {
                    const res = typeof json === 'string' ? JSON.parse(json) : json;
                    console.log('[Notes API] createNote response:', res);

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
                    this.fetchNotesFromApi();
                })
                .catch(err => {
                    const errorMsg = err?.body?.message || err?.message || 'Could not create note.';
                    console.error('[Notes API] createNote error:', err);
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Error Creating Note',
                            message: errorMsg,
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
            console.log('[Notes API] Editing note with id:', target.id);
            this.currentNoteId = target.id;
            this.currentNoteTitle = target.title;
            this.currentNoteContent = target.content;
            this.currentSourceTab = target.sourceTab || 'Discovery Call Insights';
            this.currentSourceSection = target.sourceSection || 'Manual';
            this.isEditingNote = true;
        }
    }

    // ─── 7. DELETE Handler ───
    handleDeleteNote(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;

        console.log(`%c[Notes API] Deleting Note (DELETE) noteId: ${id}`, 'color: #dc2626; font-weight: bold;');

        deleteNote({ noteId: id })
            .then(res => {
                console.log('[Notes API] deleteNote response:', res);
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
                const errorMsg = err?.body?.message || err?.message || 'Could not delete note.';
                console.error('[Notes API] deleteNote error:', err);
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error Deleting Note',
                        message: errorMsg,
                        variant: 'error'
                    })
                );
            });
    }

    handlePrintNotes() {
        window.print();
    }

    // ─── Template Getters ───
    get plan()           { return this.insightsData?.discoveryCallPlan; }
    get companyProfile() { return this.plan?.companyProfile; }
    get callStrategy()   { return this.plan?.callStrategy; }
    get rawInsights()    { return this.plan?.insights || []; }

    get isCompanyProfileInNotes() {
        return this.notes.some(n => n.sourceSection === 'Company Profile' || n.title === 'Company Profile');
    }

    get isCallStrategyInNotes() {
        return this.notes.some(n => n.sourceSection === 'Call Strategy' || n.title === 'Call Strategy');
    }

    get hasKeyFocusAreas() {
        return Array.isArray(this.callStrategy?.keyFocusAreas) && this.callStrategy.keyFocusAreas.length > 0;
    }

    get hasFollowUpActions() {
        return Array.isArray(this.callStrategy?.followUpActions) && this.callStrategy.followUpActions.length > 0;
    }

    get insights() {
        return this.rawInsights.map(i => ({
            ...i,
            categoryClass: CATEGORY_CLASSES[i.category] || 'cdi-badge cdi-badge-gray',
            priorityClass: PRIORITY_CLASSES[i.priority] || 'cdi-badge cdi-badge-gray',
            hasQuestions:  Array.isArray(i.discoveryQuestions) && i.discoveryQuestions.length > 0,
            isAddedToNotes: this.notes.some(n => n.sourceSection === i.title || n.title === i.title)
        }));
    }

    get hasInsights() {
        return this.insights.length > 0;
    }

    get companyDisplayName() {
        return this.company?.Name || this.company?.name || 'Selected Company';
    }

    get drawerClass() {
        return `cdi-notes-drawer ${this.isNotesDrawerOpen ? 'cdi-drawer-open' : ''}`;
    }

    get notesCount() {
        return this.notes.length;
    }

    get hasNotes() {
        return this.notes.length > 0;
    }

    get notesList() {
        return this.notes.map(n => ({
            ...n,
            chevronClass: `cdi-note-chevron ${n.isExpanded ? 'cdi-chevron-down' : ''}`
        }));
    }
}
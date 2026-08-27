import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getInsights from '@salesforce/apex/CompanyDetailInsightsController.getInsights';
import getInsightsPdfDownloadUrl from '@salesforce/apex/CompanyDetailInsightsController.getInsightsPdfDownloadUrl';

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
    const date = d ? new Date(d) : new Date();
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

export default class CompanyDetailInsights extends LightningElement {
    @api companyId;
    @api company;

    @track insightsData = null;
    @track isLoading = true;
    @track error = null;
    @track isDownloadingPdf = false;

    // ─── Notes Drawer State ───
    @track isNotesDrawerOpen = false;
    @track notes = [];
    @track isEditingNote = false;
    @track currentNoteId = null;
    @track currentNoteTitle = '';
    @track currentNoteContent = '';

    connectedCallback() {
        this.loadInsights();
        this.loadSavedNotes();
    }

    loadInsights() {
        if (!this.companyId) {
            this.isLoading = false;
            return;
        }
        this.isLoading = true;
        this.error = null;

        getInsights({ companyId: this.companyId })
            .then(json => {
                this.insightsData = typeof json === 'string' ? JSON.parse(json) : json;
            })
            .catch(err => {
                console.error('Insights load error', err);
                this.error = err?.body?.message || 'Failed to load insights.';
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ─── PDF Download Handler ───
    handleDownloadPdf() {
        if (!this.companyId || this.isDownloadingPdf) return;

        this.isDownloadingPdf = true;

        getInsightsPdfDownloadUrl({ companyId: this.companyId })
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

    // ─── Notes Storage & Actions ───
    loadSavedNotes() {
        if (!this.companyId) return;
        try {
            const raw = localStorage.getItem(`ain_notes_${this.companyId}`);
            if (raw) {
                this.notes = JSON.parse(raw);
            }
        } catch (e) {
            console.error('Error loading notes from localStorage', e);
        }
    }

    saveNotesToStorage() {
        if (!this.companyId) return;
        try {
            localStorage.setItem(`ain_notes_${this.companyId}`, JSON.stringify(this.notes));
        } catch (e) {
            console.error('Error saving notes to localStorage', e);
        }
    }

    handleToggleNotesDrawer() {
        this.isNotesDrawerOpen = !this.isNotesDrawerOpen;
    }

    handleCloseNotesDrawer() {
        this.isNotesDrawerOpen = false;
        this.isEditingNote = false;
    }

    handleAddNoteFromSection(event) {
        const sectionTitle = event.currentTarget.dataset.section || 'General Note';
        this.currentNoteId = null;
        this.currentNoteTitle = sectionTitle;
        this.currentNoteContent = '';
        this.isEditingNote = true;
        this.isNotesDrawerOpen = true;
    }

    handleOpenNewNoteForm() {
        this.currentNoteId = null;
        this.currentNoteTitle = '';
        this.currentNoteContent = '';
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

    handleSaveNote() {
        if (!this.currentNoteTitle.trim() && !this.currentNoteContent.trim()) {
            this.handleCancelNoteEdit();
            return;
        }

        const now = new Date().toISOString();
        if (this.currentNoteId) {
            // Update existing
            this.notes = this.notes.map(n => {
                if (n.id === this.currentNoteId) {
                    return {
                        ...n,
                        title: this.currentNoteTitle.trim() || 'Untitled Note',
                        content: this.currentNoteContent.trim(),
                        timestamp: formatTimestamp(now)
                    };
                }
                return n;
            });
        } else {
            // Insert new
            const newNote = {
                id: `note-${Date.now()}`,
                title: this.currentNoteTitle.trim() || 'General Note',
                content: this.currentNoteContent.trim(),
                timestamp: formatTimestamp(now),
                isExpanded: true
            };
            this.notes = [newNote, ...this.notes];
        }

        this.saveNotesToStorage();
        this.handleCancelNoteEdit();
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
            this.isEditingNote = true;
        }
    }

    handleDeleteNote(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        this.notes = this.notes.filter(n => n.id !== id);
        this.saveNotesToStorage();
    }

    handlePrintNotes() {
        window.print();
    }

    // ─── Getters ───
    get plan()           { return this.insightsData?.discoveryCallPlan; }
    get companyProfile() { return this.plan?.companyProfile; }
    get callStrategy()   { return this.plan?.callStrategy; }
    get rawInsights()    { return this.plan?.insights || []; }

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
            hasQuestions:  Array.isArray(i.discoveryQuestions) && i.discoveryQuestions.length > 0
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
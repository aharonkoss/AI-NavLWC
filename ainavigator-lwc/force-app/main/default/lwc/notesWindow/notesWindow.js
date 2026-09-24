import { LightningElement, api, track, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import EMAIL_FIELD from '@salesforce/schema/User.Email';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';
import getNotes from '@salesforce/apex/CompanyDetailController.getNotes';
import createNote from '@salesforce/apex/CompanyDetailController.createNote';
import updateNote from '@salesforce/apex/CompanyDetailController.updateNote';
import deleteNote from '@salesforce/apex/CompanyDetailController.deleteNote';

function stripMarkdown(text) {
  if (!text) return '';
  let cleaned = text.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
  cleaned = cleaned.replace(/^#+\s+/gm, '');
  cleaned = cleaned.replace(/\[\d+\]/g, '');
  return cleaned.trim();
}

function parseAndCleanContent(rawContent, title = '') {
  if (!rawContent) return '';
  const cleanTitle = (title || '').trim().toLowerCase();
  const isProfileOrSummary =
    cleanTitle === 'company profile' ||
    cleanTitle === 'executive summary' ||
    cleanTitle === 'company overview';

  // 1. Extract Business Description narrative if present
  if (isProfileOrSummary) {
    const descMatch = rawContent.match(
      /\*{0,2}Business\s+(?:Description|profile)[:.]\*{0,2}\s*([\s\S]+)/i
    );
    if (descMatch && descMatch[1]) {
      let descText = descMatch[1].trim();
      const nextHeading = descText.match(/^([\s\S]*?)(?=\n#{1,3}\s|\n\*{2}[A-Z])/);
      if (nextHeading && nextHeading[1]) {
        descText = nextHeading[1].trim();
      }
      return stripMarkdown(descText);
    }
  }

  // 2. Convert Markdown table rows into clean text lines
  if (rawContent.includes('|')) {
    const lines = rawContent.split('\n');
    const parsedLines = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => stripMarkdown(c.trim()));

        if (cells.length >= 2) {
          const col1 = cells[0];
          const col2 = cells[1];
          if (
            col1.toLowerCase() === 'field' ||
            col1.toLowerCase() === 'attribute' ||
            col1.startsWith('---') ||
            /^:?-+:?$/.test(col1)
          ) {
            continue;
          }
          if (col1 && col2) {
            parsedLines.push(`${col1}: ${col2}`);
          } else if (col1) {
            parsedLines.push(`${col1}`);
          }
        }
      } else if (trimmed) {
        parsedLines.push(stripMarkdown(trimmed));
      }
    }

    if (parsedLines.length > 0) {
      return parsedLines.join('\n');
    }
  }

  return stripMarkdown(rawContent);
}

function formatNoteDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const month = dt.toLocaleDateString('en-US', { month: 'short' });
    const day = dt.getDate();
    let hours = dt.getHours();
    const minutes = dt.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return String(d);
  }
}

function formatPrintNoteDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const month = dt.toLocaleDateString('en-US', { month: 'short' });
    const day = dt.getDate();
    const year = dt.getFullYear();
    let hours = dt.getHours();
    const minutes = dt.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return String(d);
  }
}

export default class NotesWindow extends LightningElement {
  _companyId = null;
  _isConnected = false;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const isNew = this._companyId !== value;
    this._companyId = value;
    if (value && isNew && this._isConnected) {
      this.refreshAll();
    }
  }

  @api companyName;
  @api sourceTab = 'Research Library';

  @track _dynamicCompanyName = '';
  @track isNotesOpen = false;
  @track isPrintPreviewOpen = false;
  @track drawerWidth = 480;
  @track isLoadingNotes = false;
  @track isAddingNote = false;
  @track isSavingNote = false;
  @track newNoteTitle = '';
  @track newNoteContent = '';
  @track notes = [];

  @wire(getRecord, { recordId: USER_ID, fields: [EMAIL_FIELD] })
  currentUser;

  _isResizing = false;
  _startX = 0;
  _startWidth = 480;

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.refreshAll();
    }
    this._boundOnMouseMove = this.onMouseMove.bind(this);
    this._boundOnMouseUp = this.onMouseUp.bind(this);
    window.addEventListener('mousemove', this._boundOnMouseMove);
    window.addEventListener('mouseup', this._boundOnMouseUp);
  }

  disconnectedCallback() {
    this._isConnected = false;
    window.removeEventListener('mousemove', this._boundOnMouseMove);
    window.removeEventListener('mouseup', this._boundOnMouseUp);
  }

  refreshAll() {
    this.fetchCompanyDetails();
    this.loadNotesData();
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

  @api
  openDrawer() {
    this.isNotesOpen = true;
    this.loadNotesData();
  }

  @api
  closeDrawer() {
    this.isNotesOpen = false;
  }

  @api
  refreshNotes() {
    this.loadNotesData();
  }

  @api
  addOrOpenLeaderNote(leaderInfo) {
    this.isNotesOpen = true;
    const leaderName = leaderInfo.fullName || leaderInfo.name || '';

    const existing = this.notes.find(
      (n) => (n.title || '').trim().toLowerCase() === leaderName.trim().toLowerCase()
    );

    if (existing) {
      this.notes = this.notes.map((n) => ({
        ...n,
        isExpanded: n.id === existing.id,
        chevronClass:
          n.id === existing.id
            ? 'nw-chevron-arrow nw-chevron-arrow--open'
            : 'nw-chevron-arrow'
      }));
      this.isAddingNote = false;
      return;
    }

    const lines = [];
    lines.push(leaderName);
    if (leaderInfo.designation) lines.push(`Title: ${leaderInfo.designation}`);
    const company = leaderInfo.companyName || this.displayCompanyName;
    if (company) lines.push(`Company: ${company}`);
    if (leaderInfo.location) lines.push(`Location: ${leaderInfo.location}`);
    lines.push('CONTACT INFORMATION:');

    if (leaderInfo.emails && leaderInfo.emails.length > 0) {
      const emailList = leaderInfo.emails
        .map((e) => e.email || e)
        .filter(Boolean)
        .join(', ');
      if (emailList) lines.push(`Email(s): ${emailList}`);
    }
    if (leaderInfo.phones && leaderInfo.phones.length > 0) {
      const phoneList = leaderInfo.phones
        .map((p) => p.number || p)
        .filter(Boolean)
        .join(', ');
      if (phoneList) lines.push(`Phone(s): ${phoneList}`);
    }

    this.isLoadingNotes = true;
    createNote({
      companyId: this._companyId,
      title: leaderName,
      content: lines.join('\n'),
      sourceTab: 'Leadership',
      sourceSection: leaderInfo.designation || 'Leader'
    })
      .then(() => {
        this.loadNotesData();
      })
      .catch((err) => {
        console.error('Error creating leader note:', err);
      })
      .finally(() => {
        this.isLoadingNotes = false;
      });
  }

  loadNotesData() {
    if (!this._companyId) return;
    this.isLoadingNotes = true;

    getNotes({ companyId: this._companyId })
      .then((res) => {
        const parsed = res ? (typeof res === 'string' ? JSON.parse(res) : res) : null;
        const rawNotes = parsed?.notes || parsed?.data || (Array.isArray(parsed) ? parsed : []);
        this.mapNotesList(rawNotes);
      })
      .catch((err) => {
        console.error('Error fetching notes:', err);
      })
      .finally(() => {
        this.isLoadingNotes = false;
      });
  }

  mapNotesList(rawNotes) {
    const excludedTitles = new Set([
      'call objective',
      'call objectives'
    ]);

    const seenIds = new Set();
    let seenCompanyProfile = false;
    const uniqueRawNotes = [];

    (rawNotes || []).forEach((n) => {
      const id = n.id || n.noteId;
      if (id && seenIds.has(id)) return;
      if (id) seenIds.add(id);

      const rawTitle = (n.title || '').trim().toLowerCase();

      if (excludedTitles.has(rawTitle)) return;

      if (rawTitle === 'executive summary' || rawTitle === 'company profile') {
        if (seenCompanyProfile) return;
        seenCompanyProfile = true;
      }
      uniqueRawNotes.push(n);
    });

    this.notes = uniqueRawNotes.map((n) => {
      let title = n.title || 'Untitled Note';

      if (title.trim().toLowerCase() === 'executive summary') {
        title = 'Company Profile';
      }

      let tagLabel = 'User Created';
      let printCategory = 'MANUAL';

      if (title.trim().toLowerCase() === 'company profile') {
        tagLabel = 'Company Profile';
        printCategory = 'COMPANY PROFILE';
      } else if (title.trim().toLowerCase() === 'company overview') {
        tagLabel = n.sourceSection || 'company-overview';
        printCategory = 'A I RESEARCH';
      } else if (title.trim().toLowerCase() === 'call strategy') {
        tagLabel = 'Call Strategy';
        printCategory = 'CALL STRATEGY';
      } else if (title.trim().toLowerCase() === 'call objective') {
        tagLabel = 'Call Objective';
        printCategory = 'CALL OBJECTIVE';
      } else if (n.sourceTab && n.sourceTab.toLowerCase() === 'leadership') {
        tagLabel = n.sourceSection || 'Leader';
        printCategory = 'LEADERSHIP';
      } else if (n.sourceTab && n.sourceTab.toLowerCase().includes('research')) {
        tagLabel = n.sourceSection || 'Research';
        printCategory = 'A I RESEARCH';
      } else if (n.sourceSection) {
        tagLabel = n.sourceSection;
      }

      const parsedContent = parseAndCleanContent(n.content, title);

      return {
        id: n.id || n.noteId || String(Math.random()),
        title: title,
        content: parsedContent,
        rawContent: n.content || '',
        tagLabel: tagLabel,
        printCategory: printCategory,
        sourceTab: n.sourceTab || this.sourceTab,
        sourceSection: n.sourceSection || '',
        createdAt: n.createdAt || n.createdDate || new Date().toISOString(),
        formattedDate: formatNoteDate(n.createdAt || n.createdDate || new Date()),
        printFormattedDate: formatPrintNoteDate(n.createdAt || n.createdDate || new Date()),
        isExpanded: false,
        chevronClass: 'nw-chevron-arrow',
        isEditing: false,
        editContent: parsedContent
      };
    });

    this.dispatchEvent(
      new CustomEvent('notesupdated', {
        detail: { notes: this.notes }
      })
    );
  }

  handleOpenDrawer() {
    this.isNotesOpen = true;
    this.loadNotesData();
  }

  handleCloseDrawer() {
    this.isNotesOpen = false;
  }

  handleOpenAddForm() {
    this.newNoteTitle = '';
    this.newNoteContent = '';
    this.isAddingNote = true;
  }

  handleCancelAddForm() {
    this.isAddingNote = false;
    this.newNoteTitle = '';
    this.newNoteContent = '';
  }

  handleNoteTitleChange(event) {
    this.newNoteTitle = event.target.value;
  }

  handleNoteContentChange(event) {
    this.newNoteContent = event.target.value;
  }

  handleToolBold() {
    this.newNoteContent = (this.newNoteContent || '') + ' **bold** ';
  }

  handleToolItalic() {
    this.newNoteContent = (this.newNoteContent || '') + ' *italic* ';
  }

  handleToolBullet() {
    this.newNoteContent = (this.newNoteContent || '') + '\n• ';
  }

  handleSaveNewNote() {
    if (!this.newNoteContent && !this.newNoteTitle) return;

    this.isSavingNote = true;
    createNote({
      companyId: this._companyId,
      title: this.newNoteTitle || 'Test Note',
      content: this.newNoteContent || '',
      sourceTab: this.sourceTab || 'Manual',
      sourceSection: 'User Created'
    })
      .then(() => {
        this.isAddingNote = false;
        this.newNoteTitle = '';
        this.newNoteContent = '';
        this.loadNotesData();
      })
      .catch((err) => {
        console.error('Error saving note:', err);
      })
      .finally(() => {
        this.isSavingNote = false;
      });
  }

  toggleAccordion(event) {
    const noteId = event.currentTarget.dataset.id;
    this.notes = this.notes.map((n) => {
      const isTarget = n.id === noteId;
      const nextState = isTarget ? !n.isExpanded : false;
      return {
        ...n,
        isExpanded: nextState,
        chevronClass: nextState
          ? 'nw-chevron-arrow nw-chevron-arrow--open'
          : 'nw-chevron-arrow'
      };
    });
  }

  handleStartEdit(event) {
    event.stopPropagation();
    const noteId = event.currentTarget.dataset.id;
    this.notes = this.notes.map((n) => ({
      ...n,
      isEditing: n.id === noteId,
      editContent: n.id === noteId ? n.content : n.editContent
    }));
  }

  handleInlineChange(event) {
    const noteId = event.currentTarget.dataset.id;
    const val = event.target.value;
    this.notes = this.notes.map((n) => (n.id === noteId ? { ...n, editContent: val } : n));
  }

  handleCancelInlineEdit(event) {
    const noteId = event.currentTarget.dataset.id;
    this.notes = this.notes.map((n) => (n.id === noteId ? { ...n, isEditing: false } : n));
  }

  handleSaveInlineEdit(event) {
    const noteId = event.currentTarget.dataset.id;
    const target = this.notes.find((n) => n.id === noteId);
    if (!target) return;

    updateNote({
      noteId: target.id,
      title: target.title,
      content: target.editContent
    })
      .then(() => {
        this.loadNotesData();
      })
      .catch((err) => {
        console.error('Error updating note:', err);
      });
  }

  handleDelete(event) {
    event.stopPropagation();
    const noteId = event.currentTarget.dataset.id;
    if (!noteId) return;

    deleteNote({ noteId })
      .then(() => {
        this.loadNotesData();
      })
      .catch((err) => {
        console.error('Error deleting note:', err);
      });
  }

  handleOpenPrintPreview() {
    this.isPrintPreviewOpen = true;
  }

  handleClosePrintPreview() {
    this.isPrintPreviewOpen = false;
  }

  handleExecutePrint() {
      const printArea = this.template.querySelector('.nw-print-page');
      if (!printArea) {
        window.print();
        return;
      }

      try {
        const printWindow = window.open('', '_blank', 'width=850,height=900');
        if (!printWindow) {
          window.print();
          return;
        }

        const clone = printArea.cloneNode(true);

        const style = printWindow.document.createElement('style');
        style.textContent = `
          @page {
            margin: 14mm 16mm;
            size: portrait;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            color: #1e293b;
            margin: 0;
            padding: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .nw-print-page {
            width: 100%;
            max-width: 100%;
            padding: 0;
            border: none;
            box-shadow: none;
          }
          .nw-doc-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
          }
          .nw-doc-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 2px 0;
            line-height: 1.2;
          }
          .nw-doc-company {
            font-size: 13px;
            color: #4b5563;
            font-weight: 500;
          }
          .nw-doc-header-right {
            text-align: right;
            font-size: 11px;
            color: #6b7280;
            line-height: 1.4;
          }
          .nw-doc-date {
            font-weight: 500;
            color: #6b7280;
            margin-bottom: 1px;
          }
          .nw-doc-prepared {
            color: #64748b;
          }
          .nw-doc-divider {
            height: 2px;
            background-color: #1c64f2;
            margin: 10px 0 16px 0;
          }
          .nw-doc-group {
            margin-bottom: 18px;
          }
          .nw-doc-category-title {
            font-size: 11px;
            font-weight: 700;
            color: #1c64f2;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .nw-doc-note-item {
            margin-bottom: 12px;
          }
          .nw-doc-note-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 4px;
          }
          .nw-doc-note-title {
            font-size: 13px;
            font-weight: 700;
            color: #111827;
          }
          .nw-doc-note-meta-right {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .nw-doc-tag-badge {
            background-color: #f3f4f6;
            color: #4b5563;
            font-size: 11px;
            font-weight: 500;
            padding: 1px 7px;
            border-radius: 4px;
          }
          .nw-doc-note-date {
            font-size: 11px;
            color: #6b7280;
          }
          .nw-doc-note-body {
            border-left: 2px solid #e5e7eb;
            padding-left: 8px;
            margin-left: 1px;
            margin-top: 2px;
          }
          .nw-doc-note-content {
            font-size: 12px;
            color: #374151;
            line-height: 1.55;
            white-space: pre-wrap;
            margin: 0;
          }
          .nw-doc-footer {
            margin-top: 24px;
            padding-top: 10px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
          }
          .nw-doc-footer-brand {
            font-weight: 600;
            margin-bottom: 2px;
          }
          .nw-doc-footer-conf {
            font-size: 10px;
            color: #94a3af;
          }
        `;

        printWindow.document.title = `Research Notes - ${this.displayCompanyName}`;
        printWindow.document.head.appendChild(style);
        printWindow.document.body.appendChild(clone);

        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 300);
      } catch (e) {
        console.warn('Dedicated print window fallback:', e);
        window.print();
      }
    }  

  startResize(event) {
    event.preventDefault();
    this._isResizing = true;
    this._startX = event.clientX;
    this._startWidth = this.drawerWidth;
  }

  onMouseMove(event) {
    if (!this._isResizing) return;
    const delta = this._startX - event.clientX;
    let newWidth = this._startWidth + delta;
    if (newWidth < 320) newWidth = 320;
    if (newWidth > 900) newWidth = 900;
    this.drawerWidth = newWidth;
  }

  onMouseUp() {
    this._isResizing = false;
  }

  get displayCompanyName() {
    return this.companyName || this._dynamicCompanyName || 'Company';
  }

  get currentUserEmail() {
    return getFieldValue(this.currentUser?.data, EMAIL_FIELD) || 'aharon.koss@performanceinsightsteam.com';
  }

  get printCurrentDate() {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  get drawerStyle() {
    return `width: ${this.drawerWidth}px;`;
  }

  get notesCount() {
    return this.notes.length;
  }

  get notesList() {
    return this.notes;
  }

  get printGroupedSections() {
    const order = [
      'MANUAL',
      'A I RESEARCH',
      'COMPANY PROFILE',
      'LEADERSHIP',
      'CALL STRATEGY',
      'CALL OBJECTIVE'
    ];
    const groupsMap = new Map();

    this.notes.forEach((note) => {
      const cat = note.printCategory || 'MANUAL';
      if (!groupsMap.has(cat)) {
        groupsMap.set(cat, []);
      }
      groupsMap.get(cat).push(note);
    });

    const result = [];
    order.forEach((cat) => {
      if (groupsMap.has(cat)) {
        result.push({ category: cat, notes: groupsMap.get(cat) });
        groupsMap.delete(cat);
      }
    });

    groupsMap.forEach((notes, category) => {
      result.push({ category, notes });
    });

    return result;
  }
}
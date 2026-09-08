import { LightningElement, api, track } from 'lwc';
import getLeadership from '@salesforce/apex/CompanyDetailController.getLeadership';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';
import getAiResearch from '@salesforce/apex/CompanyDetailController.getAiResearch';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';
import getNotes from '@salesforce/apex/CompanyDetailController.getNotes';
import createNote from '@salesforce/apex/CompanyDetailController.createNote';
import updateNote from '@salesforce/apex/CompanyDetailController.updateNote';
import deleteNote from '@salesforce/apex/CompanyDetailController.deleteNote';

// In-Memory Module Level Caches
const leadershipCache = new Map();
const companyCache = new Map();
const notesCache = new Map();

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

function formatLeaderNoteContent(exec, currentCompanyName) {
  const lines = [];
  lines.push(exec.fullName);
  if (exec.designation) {
    lines.push(`Title: ${exec.designation}`);
  }
  const company = exec.companyName || currentCompanyName || '';
  if (company) {
    lines.push(`Company: ${company}`);
  }
  if (exec.location) {
    lines.push(`Location: ${exec.location}`);
  }
  lines.push('CONTACT INFORMATION:');

  if (exec.emails && exec.emails.length > 0) {
    const emailList = exec.emails.map((e) => e.email).filter(Boolean).join(', ');
    if (emailList) {
      lines.push(`Email(s): ${emailList}`);
    }
  }
  if (exec.phones && exec.phones.length > 0) {
    const phoneList = exec.phones.map((p) => p.number).filter(Boolean).join(', ');
    if (phoneList) {
      lines.push(`Phone(s): ${phoneList}`);
    }
  }
  return lines.join('\n');
}

function buildLeadershipViewModel(raw, existingNotes = []) {
  if (!raw) return { executives: [] };

  const list = Array.isArray(raw)
    ? raw
    : raw.executives || raw.leaders || raw.leadership?.leaders || raw.leadership || [];

  const noteTitles = new Set(
    (existingNotes || []).map((n) => (n.title || '').trim().toLowerCase())
  );

  const executives = list
    .map((p, idx) => {
      const fullName = p.fullName || p.name || '';
      if (!fullName) return null;

      const initials = fullName
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0].toUpperCase())
        .slice(0, 2)
        .join('');

      const sourceMap = {
        rocketreach: { label: 'Verified', cls: 'ldr-badge ldr-badge--high' },
        perplexity: { label: 'Unverified', cls: 'ldr-badge ldr-badge--low' }
      };
      const conf = sourceMap[p.source] || {
        label: p.confidence || 'Verified',
        cls: p.confidence === 'low' ? 'ldr-badge ldr-badge--low' : 'ldr-badge ldr-badge--high'
      };

      const rawTitle = p.designation || p.title || '';
      const designation = rawTitle.length > 60 ? rawTitle.substring(0, 57) + '...' : rawTitle;

      // Emails
      const rawEmails = Array.isArray(p.emails) && p.emails.length > 0
        ? p.emails
        : p.email
        ? [{ email: p.email, type: 'professional', grade: '' }]
        : [];
      const emails = rawEmails.map((e) => ({
        email: typeof e === 'string' ? e : e.email,
        type: typeof e === 'object' ? e.email_type || e.type || 'professional' : 'professional',
        grade: typeof e === 'object' ? e.grade || '' : ''
      }));
      const recommendedEmail = emails.find((e) => e.grade === 'A' || e.grade === 'A-') || emails[0] || null;

      // Phones
      const rawPhones = Array.isArray(p.phones) && p.phones.length > 0
        ? p.phones
        : p.phone
        ? [{ number: p.phone, type: 'professional', recommended: true }]
        : [];
      const phones = rawPhones.map((ph) => ({
        number: typeof ph === 'string' ? ph : ph.number || ph.phone || '',
        type: typeof ph === 'object' ? ph.type || '' : '',
        recommended: typeof ph === 'object' ? !!ph.recommended : false
      }));

      // Job history
      const jobHistory = (p.jobHistory || []).map((j, jIdx) => ({
        key: `jh-${idx}-${jIdx}`,
        title: j.title || '',
        company: j.company || '',
        startDate: formatDate(j.startDate),
        endDate: j.isCurrent ? 'Present' : formatDate(j.endDate),
        isCurrent: !!j.isCurrent,
        rowClass: j.isCurrent ? 'ldr-job-row ldr-job-row--current' : 'ldr-job-row'
      }));

      // Education
      const education = (p.education || []).map((e, eIdx) => ({
        key: `edu-${idx}-${eIdx}`,
        school: e.school || '',
        degree: e.degree || '',
        major: e.major || ''
      }));

      const skills = (p.skills || []).filter(Boolean);
      const linkedInUrl = p.linkedInUrl || p.links?.linkedin || null;
      const twitterUrl = p.twitterUrl || p.links?.twitter || null;

      const hasNote = noteTitles.has(fullName.trim().toLowerCase());
      const noteBtnClass = hasNote
        ? 'ldr-leader-note-btn ldr-leader-note-btn--checked'
        : 'ldr-leader-note-btn ldr-leader-note-btn--plus';
      const noteBtnTitle = hasNote ? `View note for ${fullName}` : `Add note for ${fullName}`;

      return {
        id: String(p.id || p.rocketReachId || idx),
        fullName,
        initials,
        designation,
        companyName: p.company || p.companyName || '',
        location: p.location || [p.city, p.state, p.country].filter(Boolean).join(', ') || '',
        profilePicUrl: p.profilePicUrl || null,
        hasProfilePic: !!p.profilePicUrl,
        confidenceLabel: conf.label,
        confidenceClass: conf.cls,
        hasNote,
        noteBtnClass,
        noteBtnTitle,
        emails,
        recommendedEmail,
        hasEmails: emails.length > 0,
        emailCount: emails.length,
        phones,
        hasPhones: phones.length > 0,
        phoneCount: phones.length,
        jobHistory,
        hasJobHistory: jobHistory.length > 0,
        jobHistoryCount: jobHistory.length,
        education,
        hasEducation: education.length > 0,
        educationCount: education.length,
        skills,
        hasSkills: skills.length > 0,
        skillCount: skills.length,
        linkedInUrl,
        hasLinkedIn: !!linkedInUrl,
        twitterUrl,
        hasTwitter: !!twitterUrl
      };
    })
    .filter(Boolean);

  return {
    executives,
    hasExecutives: executives.length > 0
  };
}

export default class DetailLeadership extends LightningElement {
  _companyId;
  _isConnected = false;
  _isCreatingExecSummary = false;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const isNew = this._companyId !== value;
    this._companyId = value;
    if (value && isNew && this._isConnected) {
      this._isCreatingExecSummary = false;
      this.initData();
    }
  }

  @api companyName;

  @track _dynamicCompanyName = '';
  @track _viewModel = null;
  @track _isLoading = false;
  @track _error = null;

  // Notes state
  @track isNotesOpen = false;
  @track drawerWidth = 480;
  @track isLoadingNotes = false;
  @track isAddingNote = false;
  @track isSavingNote = false;
  @track newNoteTitle = '';
  @track newNoteContent = '';
  @track notes = [];

  // Drag resize
  _isResizing = false;
  _startX = 0;
  _startWidth = 480;

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.initData();
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

  initData(forceRefresh = false) {
    this.fetchCompanyDetails(forceRefresh);
    this.loadNotesData(forceRefresh).then(() => {
      this.loadLeadership(forceRefresh);
    });
  }

  fetchCompanyDetails(forceRefresh = false) {
    if (!this._companyId) return;

    if (!forceRefresh && companyCache.has(this._companyId)) {
      this._dynamicCompanyName = companyCache.get(this._companyId);
      return;
    }

    getCompany({ companyId: this._companyId })
      .then((res) => {
        if (!res) return;
        const comp = typeof res === 'string' ? JSON.parse(res) : res;
        this._dynamicCompanyName = comp.name || comp.Name || '';
        companyCache.set(this._companyId, this._dynamicCompanyName);
      })
      .catch((e) => {
        console.warn('Could not fetch company info:', e);
      });
  }

  loadLeadership(forceRefresh = false) {
    if (!this._companyId) return;

    // 1. Instant Cache Hit Check
    if (!forceRefresh && leadershipCache.has(this._companyId)) {
      this._rawLeadershipData = leadershipCache.get(this._companyId);
      this._viewModel = buildLeadershipViewModel(this._rawLeadershipData, this.notes);
      this._error = null;
      this._isLoading = false;
      return;
    }

    this._isLoading = true;
    this._error = null;

    getLeadership({ companyId: this._companyId })
      .then((json) => {
        if (!json) {
          return getAiNavigatorReport({ companyId: this._companyId }).then((reportJson) => {
            if (!reportJson) return null;
            const report = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
            return report?.leadership?.leaders || report?.leadership || report?.executives;
          });
        }
        return typeof json === 'string' ? JSON.parse(json) : json;
      })
      .then((data) => {
        this._rawLeadershipData = data;
        leadershipCache.set(this._companyId, data);
        this._viewModel = buildLeadershipViewModel(data, this.notes);
      })
      .catch((err) => {
        const errorMsg =
          err?.body?.message ||
          err?.message ||
          (typeof err?.body === 'string' ? err.body : null) ||
          'Failed to load leadership data.';
        this._error = errorMsg;
      })
      .finally(() => {
        this._isLoading = false;
      });
  }

  mapNotesList(rawNotes) {
    const execMap = new Map();
    (this.executives || []).forEach((e) => {
      execMap.set(e.fullName.toLowerCase(), e.designation || 'Leader');
    });

    const excludedTitles = new Set([
      'company profile',
      'call objective',
      'call objectives'
    ]);

    const seenIds = new Set();
    let seenExecSummary = false;
    const uniqueRawNotes = [];

    (rawNotes || []).forEach((n) => {
      const id = n.id || n.noteId;
      if (id && seenIds.has(id)) return;
      if (id) seenIds.add(id);

      const title = (n.title || '').trim().toLowerCase();
      if (excludedTitles.has(title)) return;

      if (title === 'executive summary') {
        if (seenExecSummary) return;
        seenExecSummary = true;
      }
      uniqueRawNotes.push(n);
    });

    this.notes = uniqueRawNotes.map((n) => {
      const title = n.title || 'Untitled Note';
      let tagLabel = 'User Created';

      if (title.trim().toLowerCase() === 'executive summary') {
        tagLabel = 'Executive Summary';
      } else if (execMap.has(title.trim().toLowerCase())) {
        tagLabel = execMap.get(title.trim().toLowerCase());
      } else if (n.sourceSection) {
        tagLabel = n.sourceSection;
      }

      return {
        id: n.id || n.noteId || String(Math.random()),
        title: title,
        content: n.content || '',
        tagLabel: tagLabel,
        sourceTab: n.sourceTab || 'Leadership',
        sourceSection: n.sourceSection || '',
        createdAt: n.createdAt || n.createdDate || new Date().toISOString(),
        formattedDate: formatNoteDate(n.createdAt || n.createdDate || new Date()),
        isExpanded: false,
        chevronClass: 'ldr-chevron-arrow',
        isEditing: false,
        editContent: n.content || ''
      };
    });

    // Update Cache
    notesCache.set(this._companyId, uniqueRawNotes);

    if (this._rawLeadershipData) {
      this._viewModel = buildLeadershipViewModel(this._rawLeadershipData, this.notes);
    }
  }

  loadNotesData(forceRefresh = false) {
    if (!this._companyId) return Promise.resolve();

    // 1. Instant Cache Hit Check for Notes
    if (!forceRefresh && notesCache.has(this._companyId)) {
      const cachedNotes = notesCache.get(this._companyId);
      this.mapNotesList(cachedNotes);
      return Promise.resolve();
    }

    this.isLoadingNotes = true;

    return getNotes({ companyId: this._companyId })
      .then((res) => {
        const parsed = res ? (typeof res === 'string' ? JSON.parse(res) : res) : null;
        const rawNotes = parsed?.notes || parsed?.data || (Array.isArray(parsed) ? parsed : []);
        this.mapNotesList(rawNotes);
        this.ensureDefaultExecutiveSummaryNote();
      })
      .catch((err) => {
        console.error('Error fetching notes:', err);
      })
      .finally(() => {
        this.isLoadingNotes = false;
      });
  }

  ensureDefaultExecutiveSummaryNote() {
    if (this._isCreatingExecSummary) return;

    const hasExecSummary = this.notes.some(
      (n) => (n.title || '').trim().toLowerCase() === 'executive summary'
    );
    if (hasExecSummary) return;

    this._isCreatingExecSummary = true;

    getAiNavigatorReport({ companyId: this._companyId })
      .then((reportJson) => {
        if (!reportJson) {
          return getAiResearch({ companyId: this._companyId });
        }
        return reportJson;
      })
      .then((data) => {
        if (!data) {
          this._isCreatingExecSummary = false;
          return;
        }
        const report = typeof data === 'string' ? JSON.parse(data) : data;

        let businessDesc =
          report?.companyOverview?.businessProfile ||
          report?.companyOverview?.businessDescription ||
          report?.companyOverview?.overview ||
          report?.companyOverview?.description ||
          report?.companyOverview?.summary ||
          report?.company_overview?.business_profile ||
          report?.company_overview?.business_description ||
          (typeof report?.companyOverview === 'string' ? report.companyOverview : null) ||
          report?.businessProfile ||
          report?.businessDescription ||
          report?.business_profile ||
          report?.business_description ||
          report?.executiveSummary ||
          report?.overview ||
          '';

        if (!businessDesc && Array.isArray(report?.sections)) {
          const compSection = report.sections.find(
            (s) =>
              (s.title && s.title.toLowerCase().includes('company overview')) ||
              (s.name && s.name.toLowerCase().includes('company overview')) ||
              (s.title && s.title.toLowerCase().includes('overview'))
          );
          if (compSection) {
            businessDesc =
              compSection.businessProfile ||
              compSection.businessDescription ||
              compSection.content ||
              compSection.description ||
              '';
          }
        }

        if (businessDesc && typeof businessDesc === 'string' && businessDesc.trim()) {
          const cleanContent = businessDesc.trim();

          createNote({
            companyId: this._companyId,
            title: 'Executive Summary',
            content: cleanContent,
            sourceTab: 'Research Library',
            sourceSection: 'Executive Summary'
          })
            .then(() => {
              return getNotes({ companyId: this._companyId });
            })
            .then((refreshed) => {
              if (refreshed) {
                const p = typeof refreshed === 'string' ? JSON.parse(refreshed) : refreshed;
                const rNotes = p.notes || p.data || (Array.isArray(p) ? p : []);
                this.mapNotesList(rNotes);
              }
            })
            .catch((err) => {
              console.warn('Error during refreshed note load:', err);
            })
            .finally(() => {
              this._isCreatingExecSummary = false;
            });
        } else {
          this._isCreatingExecSummary = false;
        }
      })
      .catch((e) => {
        console.warn('Could not auto-populate Executive Summary note:', e);
        this._isCreatingExecSummary = false;
      });
  }

  handleLeadershipRefresh() {
    this._isCreatingExecSummary = false;
    leadershipCache.delete(this._companyId);
    companyCache.delete(this._companyId);
    notesCache.delete(this._companyId);
    this.initData(true);
  }

  // ─── Leader Note 1-Click Action ───

  handleLeaderNoteClick(event) {
    const execId = event.currentTarget.dataset.id;
    const exec = this.executives.find((e) => e.id === execId);
    if (!exec) return;

    this.isNotesOpen = true;

    const existing = this.notes.find(
      (n) => (n.title || '').trim().toLowerCase() === (exec.fullName || '').trim().toLowerCase()
    );

    if (existing) {
      this.notes = this.notes.map((n) => ({
        ...n,
        isExpanded: n.id === existing.id,
        chevronClass: n.id === existing.id ? 'ldr-chevron-arrow ldr-chevron-arrow--open' : 'ldr-chevron-arrow'
      }));
      this.isAddingNote = false;
      return;
    }

    const noteContent = formatLeaderNoteContent(exec, this.displayCompanyName);
    const noteTitle = exec.fullName;
    const designationBadge = exec.designation || 'Leader';

    this.isLoadingNotes = true;
    createNote({
      companyId: this._companyId,
      title: noteTitle,
      content: noteContent,
      sourceTab: 'Leadership',
      sourceSection: designationBadge
    })
      .then(() => {
        return this.loadNotesData(true);
      })
      .catch((err) => {
        console.error('Error creating leader note:', err);
      })
      .finally(() => {
        this.isLoadingNotes = false;
      });
  }

  // ─── Manual Add Note Form ───

  handleOpenAddNoteForm() {
    this.newNoteTitle = '';
    this.newNoteContent = '';
    this.isAddingNote = true;
  }

  handleCancelNoteForm() {
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

  handleSaveNote() {
    if (!this.newNoteContent && !this.newNoteTitle) return;

    this.isSavingNote = true;
    createNote({
      companyId: this._companyId,
      title: this.newNoteTitle || 'Test Note',
      content: this.newNoteContent || '',
      sourceTab: 'Leadership',
      sourceSection: 'User Created'
    })
      .then(() => {
        this.isAddingNote = false;
        this.newNoteTitle = '';
        this.newNoteContent = '';
        return this.loadNotesData(true);
      })
      .catch((err) => {
        console.error('Error saving note:', err);
      })
      .finally(() => {
        this.isSavingNote = false;
      });
  }

  // ─── Accordion & Inline Edit ───

  toggleNoteAccordion(event) {
    const noteId = event.currentTarget.dataset.id;
    this.notes = this.notes.map((n) => {
      const isTarget = n.id === noteId;
      const nextState = isTarget ? !n.isExpanded : false;
      return {
        ...n,
        isExpanded: nextState,
        chevronClass: nextState ? 'ldr-chevron-arrow ldr-chevron-arrow--open' : 'ldr-chevron-arrow'
      };
    });
  }

  handleStartEditNote(event) {
    event.stopPropagation();
    const noteId = event.currentTarget.dataset.id;
    this.notes = this.notes.map((n) => ({
      ...n,
      isEditing: n.id === noteId,
      editContent: n.id === noteId ? n.content : n.editContent
    }));
  }

  handleInlineContentChange(event) {
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
        return this.loadNotesData(true);
      })
      .catch((err) => {
        console.error('Error updating note:', err);
      });
  }

  handleDeleteNote(event) {
    event.stopPropagation();
    const noteId = event.currentTarget.dataset.id;
    if (!noteId) return;

    deleteNote({ noteId })
      .then(() => {
        return this.loadNotesData(true);
      })
      .catch((err) => {
        console.error('Error deleting note:', err);
      });
  }

  toggleNotesDrawer() {
    this.isNotesOpen = !this.isNotesOpen;
  }

  handlePrintNotes() {
    window.print();
  }

  // ─── Resizing ───

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

  // ─── Getters ───

  get displayCompanyName() {
    return this.companyName || this._dynamicCompanyName || 'Company';
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

  get isLoading() {
    return this._isLoading;
  }
  get leadershipIsLoading() {
    return this._isLoading;
  }

  get hasError() {
    return !!this._error;
  }
  get leadershipHasError() {
    return !!this._error;
  }

  get error() {
    return this._error;
  }
  get leadershipError() {
    return this._error;
  }

  get executives() {
    return this._viewModel?.executives || [];
  }
  get leadershipExecutives() {
    return this.executives;
  }

  get hasExecutives() {
    return this.executives.length > 0;
  }
  get leadershipHasExecutives() {
    return this.hasExecutives;
  }

  get leadershipCountLabel() {
    const count = this.executives.length;
    return `${count} executive${count !== 1 ? 's' : ''}`;
  }

  get showEmptyState() {
    return !this._isLoading && !this.hasError && !this.hasExecutives;
  }
  get leadershipShowEmptyState() {
    return this.showEmptyState;
  }
}
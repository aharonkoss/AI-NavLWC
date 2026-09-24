import { LightningElement, api, track } from 'lwc';
import getLeadership from '@salesforce/apex/CompanyDetailController.getLeadership';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';

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
        rowClass: j.isCurrent ? 'ldr-job-row ldr-job-row--current contact-item' : 'ldr-job-row contact-item'
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
        company: p.company || p.companyName || '',
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
  _notes = [];
  _rawLeadershipData = null;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const isNew = this._companyId !== value;
    this._companyId = value;
    if (value && isNew && this._isConnected) {
      this.initData();
    }
  }

  @api companyName;

  @track _dynamicCompanyName = '';
  @track _viewModel = null;
  @track _isLoading = false;
  @track _error = null;

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.initData();
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
  }

  initData() {
    this.fetchCompanyDetails();
    this.loadLeadership();
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

  loadLeadership() {
    if (this._isLoading) return;
    if (!this._companyId) return;

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
        this._viewModel = buildLeadershipViewModel(data, this._notes);
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

  handleLeadershipRefresh() {
    this.initData();
  }

  // ─── Leader Note 1-Click Action ───
  handleLeaderNoteClick(event) {
    const execId = event.currentTarget.dataset.id;
    const exec = this.executives.find((e) => e.id === execId);
    if (!exec) return;

    // Delegate to child component
    const notesWin = this.template.querySelector('c-notes-window');
    if (notesWin) {
      notesWin.addOrOpenLeaderNote(exec);
    }
  }

  // ─── Reactive Checkmark Updates from Child Component ───
  handleNotesUpdated(event) {
    this._notes = event.detail.notes || [];
    if (this._rawLeadershipData) {
      this._viewModel = buildLeadershipViewModel(this._rawLeadershipData, this._notes);
    }
  }

  // ─── Template Getters ───
  get displayCompanyName() {
    return this.companyName || this._dynamicCompanyName || 'Company';
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
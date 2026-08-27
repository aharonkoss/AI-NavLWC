import { LightningElement, api, track } from 'lwc';
import getLeadership from '@salesforce/apex/CompanyDetailController.getLeadership';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';

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

function buildLeadershipViewModel(raw) {
  if (!raw) return { executives: [] };

  const list = Array.isArray(raw)
    ? raw
    : raw.executives || raw.leaders || raw.leadership?.leaders || raw.leadership || [];

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

      // Confidence badge
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

      // Skills
      const skills = (p.skills || []).filter(Boolean);

      // Social
      const linkedInUrl = p.linkedInUrl || p.links?.linkedin || null;
      const twitterUrl = p.twitterUrl || p.links?.twitter || null;

      return {
        id: String(p.id || p.rocketReachId || idx),
        fullName,
        initials,
        designation,
        location: p.location || [p.city, p.state, p.country].filter(Boolean).join(', ') || '',
        profilePicUrl: p.profilePicUrl || null,
        hasProfilePic: !!p.profilePicUrl,
        confidenceLabel: conf.label,
        confidenceClass: conf.cls,
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

export default class DetailLeadship extends LightningElement {
  _companyId;

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const isNew = this._companyId !== value;
    this._companyId = value;
    if (value && isNew) {
      this._loaded = false;
      this.loadLeadership();
    }
  }

  @track _viewModel = null;
  @track _isLoading = false;
  @track _error = null;
  @track _loaded = false;

  connectedCallback() {
    if (this._companyId && !this._loaded) {
      this.loadLeadership();
    }
  }

  loadLeadership() {
    if (this._isLoading) return;
    if (!this._companyId) return;

    this._isLoading = true;
    this._error = null;

    // Call getLeadership(companyId) first
    getLeadership({ companyId: this._companyId })
      .then((json) => {
        if (!json) {
          // If leadership endpoint returned 404/null, check if leaders exist in the AI Navigator Report
          return getAiNavigatorReport({ companyId: this._companyId }).then((reportJson) => {
            if (!reportJson) return null;
            const report = JSON.parse(reportJson);
            return report?.leadership?.leaders || report?.leadership;
          });
        }
        return typeof json === 'string' ? JSON.parse(json) : json;
      })
      .then((data) => {
        this._viewModel = buildLeadershipViewModel(data);
      })
      .catch((err) => {
        this._error = err?.body?.message || err?.message || 'Failed to load leadership data.';
      })
      .finally(() => {
        this._isLoading = false;
        this._loaded = true;
      });
  }

  handleLeadershipRefresh() {
    this._loaded = false;
    this.loadLeadership();
  }

  // ─── Getters ───
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
    return this._loaded && !this._isLoading && !this.hasError && !this.hasExecutives;
  }
  get leadershipShowEmptyState() {
    return this.showEmptyState;
  }
}
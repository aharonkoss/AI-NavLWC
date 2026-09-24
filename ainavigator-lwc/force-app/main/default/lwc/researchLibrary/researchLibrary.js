import { LightningElement, api, track } from 'lwc';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';
import getCompany from '@salesforce/apex/CompanyDetailController.getCompany';
import createNote from '@salesforce/apex/CompanyDetailController.createNote';

const reportCache = new Map();

const TITLE_OVERRIDES = {
  'ucc/lien analysis': 'UCC/Lien Analysis',
  'dot fleet intelligence': 'DOT & Fleet Intelligence',
  'dot & fleet intelligence': 'DOT & Fleet Intelligence'
};

const tryParseJson = (text) => {
  if (!text) return null;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch (e) {
    /* continue */
  }
  const cb = text.match(/(?:json)?\s([\s\S]*?)`/);
  if (cb) {
    try {
      return JSON.parse(cb[1].trim());
    } catch (e) {
      /* continue */
    }
  }
  const br = text.match(/\{[\s\S]*\}/);
  if (br) {
    try {
      return JSON.parse(br[0]);
    } catch (e) {
      /* continue */
    }
  }
  return null;
};

function headingToId(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-');
}

function resolveTitle(rawTitle) {
  return TITLE_OVERRIDES[rawTitle.toLowerCase()] || rawTitle;
}

function stripInlineMd(text) {
  if (!text) return text;
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\[\d+\]/g, '');
  return text.trim();
}

function parseContentToRows(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const rows = [];
  let tableHeaderCells = null;
  let tableBodyRows = [];
  let tableStartId = 0;

  const flushTable = (idSuffix) => {
    if (tableHeaderCells !== null) {
      rows.push({
        id: `tbl-${idSuffix}`,
        isTable: true,
        headerCells: tableHeaderCells,
        bodyRows: tableBodyRows
      });
      tableHeaderCells = null;
      tableBodyRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      flushTable(tableStartId);
      if (rows.length && !rows[rows.length - 1].isSpacer) {
        rows.push({ id: `sp-${i}`, isSpacer: true });
      }
      continue;
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => ({ text: stripInlineMd(c.trim()) }));

      if (cells.every((c) => !c.text || /^:?-+:?$/.test(c.text))) continue;

      if (tableHeaderCells === null) {
        tableHeaderCells = cells;
        tableStartId = i;
      } else {
        tableBodyRows.push({ id: `tr-${i}`, cells });
      }
      continue;
    }
    flushTable(tableStartId);
    const headingMatch = trimmed.match(/^(#{1,4})\s?(.+)/);
    if (headingMatch) {
      rows.push({
        id: `h-${i}`,
        isHeading: true,
        level: headingMatch[1].length,
        isH3: headingMatch[1].length <= 3,
        text: stripInlineMd(headingMatch[2])
      });
      continue;
    }
    const bulletMatch = raw.match(/^(\s*)[-*]\s+(.+)/);
    if (bulletMatch) {
      rows.push({
        id: `b-${i}`,
        isBullet: true,
        html: stripInlineMd(bulletMatch[2]),
        indent: Math.floor(bulletMatch[1].length / 2)
      });
      continue;
    }
    rows.push({ id: `t-${i}`, isText: true, html: stripInlineMd(trimmed) });
  }
  flushTable(tableStartId);
  return rows;
}

export default class ResearchLibrary extends LightningElement {
  _companyId;
  _isConnected = false;
  _notes = [];
  _rawSections = [];

  @api
  get companyId() {
    return this._companyId;
  }
  set companyId(value) {
    const prevCompanyId = this._companyId;
    this._companyId = value;

    if (value && value !== prevCompanyId && this._isConnected) {
      this.loadReport();
      this.fetchCompanyDetails();
    }
  }

  @api companyName;

  @track parsedSections = [];
  @track sources = [];
  @track isLoading = false;
  @track error = null;
  @track _dynamicCompanyName = '';

  connectedCallback() {
    this._isConnected = true;
    if (this._companyId) {
      this.loadReport();
      this.fetchCompanyDetails();
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
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

  loadReport() {
    if (!this._companyId) {
      this.isLoading = false;
      return;
    }

    if (reportCache.has(this._companyId)) {
      const cached = reportCache.get(this._companyId);
      this._rawSections = cached.rawSections ? JSON.parse(JSON.stringify(cached.rawSections)) : [];
      this.sources = cached.sources ? [...cached.sources] : [];
      this.error = cached.error || null;
      this.buildSectionsViewModel();
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.error = null;

    getAiNavigatorReport({ companyId: this._companyId })
      .then((json) => {
        if (!json) {
          this.error = 'Report not yet available for this company.';
          reportCache.set(this._companyId, { rawSections: [], sources: [], error: this.error });
          return;
        }

        let data = JSON.parse(json);
        let reportObj = null;
        let reportText = data.reportText || data.reporttext || '';

        if (data.report && typeof data.report === 'object' && (data.report.sections || data.report.industry)) {
          reportObj = data.report;
        } else if (data.report && typeof data.report === 'string') {
          reportObj = tryParseJson(data.report);
          if (!reportObj) reportText = data.report;
        } else if (data.output_text) {
          reportObj = tryParseJson(data.output_text);
          if (!reportObj) reportText = data.output_text;
        }

        if (reportObj && reportObj.sections && Array.isArray(reportObj.sections)) {
          this._rawSections = reportObj.sections.map((sec, idx) => ({
            id: sec.id || `sec-${idx}`,
            title: resolveTitle(sec.title || ''),
            content: sec.content || '',
            renderedRows: parseContentToRows(sec.content || ''),
            isExpanded: idx === 0
          }));
        } else {
          const textToParse = reportText || (typeof reportObj === 'string' ? reportObj : '');
          this._rawSections = this.parseReportIntoSections(textToParse);
        }

        const rawCitations = reportObj?.citations || data.citations || data.sources || [];
        this.sources = this.formatSources(rawCitations);

        reportCache.set(this._companyId, {
          rawSections: this._rawSections,
          sources: this.sources,
          error: null
        });

        this.buildSectionsViewModel();
      })
      .catch((err) => {
        this.error = `Report Load Failed: ${err?.body?.message || err?.message}`;
        this._rawSections = [];
        this.parsedSections = [];
        this.sources = [];
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  parseReportIntoSections(text) {
    if (!text) return [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const sections = [];
    const seenIds = new Set();
    const SKIP_HEADINGS = ['structured metadata', 'prepared', 'classification'];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^(#{1,2})(?!#)\s?(.+)/);
      if (!match || match[1].length === 1) return;

      const rawTitle = stripInlineMd(match[2]).replace(/^#+\s*/, '');
      if (SKIP_HEADINGS.some((kw) => rawTitle.toLowerCase().includes(kw))) return;

      const id = headingToId(rawTitle);
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const isFirst = sections.length === 0;
      sections.push({
        id,
        title: resolveTitle(rawTitle),
        startIndex: index,
        isExpanded: isFirst
      });
    });

    if (sections.length === 0) {
      return [
        {
          id: 'full-report',
          title: 'Full Report',
          content: text,
          renderedRows: parseContentToRows(text),
          isExpanded: true
        }
      ];
    }

    sections.forEach((sec, i) => {
      const start = sec.startIndex + 1;
      const end = i < sections.length - 1 ? sections[i + 1].startIndex : lines.length;
      const content = lines.slice(start, end).join('\n').trim();
      sec.content = content;
      sec.renderedRows = parseContentToRows(content);
    });
    return sections;
  }

  formatSources(raw) {
    return (raw || []).map((s, idx) => ({
      idx: idx + 1,
      url: typeof s === 'string' ? s : s.url,
      label: typeof s === 'string' ? s : s.label || s.title || s.url
    }));
  }

  buildSectionsViewModel() {
    const noteTitles = new Set(
      (this._notes || []).map((n) => (n.title || '').trim().toLowerCase())
    );

    this.parsedSections = (this._rawSections || []).map((sec) => {
      const titleLower = (sec.title || '').trim().toLowerCase();
      const isCompanyOverview =
        titleLower === 'company overview' || titleLower === 'company profile';

      // Check if note exists for this section (including Company Profile mapping)
      const hasNote =
        noteTitles.has(titleLower) ||
        (isCompanyOverview && noteTitles.has('company profile'));

      const noteBtnClass = hasNote
        ? 'cdr-section-action-btn cdr-btn-checked'
        : 'cdr-section-action-btn cdr-btn-plus';

      const noteBtnTitle = hasNote
        ? `View note for ${sec.title}`
        : `Add ${sec.title} to notes`;

      return {
        ...sec,
        hasNote,
        noteBtnClass,
        noteBtnTitle,
        chevronSvgClass: sec.isExpanded
          ? 'cdr-chevron-svg cdr-chevron-svg--open'
          : 'cdr-chevron-svg',
        ariaExpanded: sec.isExpanded ? 'true' : 'false',
        stateLabel: sec.isExpanded ? 'collapse' : 'expand'
      };
    });
  }

  handleToggle(event) {
    const id = event.currentTarget.dataset.id;
    this._rawSections = this._rawSections.map((s) =>
      s.id === id ? { ...s, isExpanded: !s.isExpanded } : s
    );
    this.buildSectionsViewModel();
  }

  handleExpandAll() {
    this._rawSections = this._rawSections.map((s) => ({ ...s, isExpanded: true }));
    this.buildSectionsViewModel();
  }

  handleCollapseAll() {
    this._rawSections = this._rawSections.map((s) => ({ ...s, isExpanded: false }));
    this.buildSectionsViewModel();
  }

  // ─── Section Plus / Check Button Action (Creates Note & Opens Drawer) ───
  handleSectionNoteClick(event) {
    event.stopPropagation();
    const id = event.currentTarget.dataset.id;
    const sec = this.parsedSections.find((s) => s.id === id);
    if (!sec) return;

    const notesWin = this.template.querySelector('c-notes-window');

    // If note already exists, simply open the drawer
    if (sec.hasNote) {
      if (notesWin) {
        notesWin.openDrawer();
      }
      return;
    }

    // Auto-create section note in API
    createNote({
      companyId: this._companyId,
      title: sec.title,
      content: sec.content || sec.title,
      sourceTab: 'Research Library',
      sourceSection: sec.title
    })
      .then(() => {
        if (notesWin) {
          notesWin.openDrawer();
          notesWin.refreshNotes();
        }
      })
      .catch((err) => {
        console.error('Error creating section note:', err);
        if (notesWin) {
          notesWin.openDrawer();
        }
      });
  }

  // ─── Real-Time Updates from <c-notes-window> ───
  handleNotesUpdated(event) {
    this._notes = event.detail.notes || [];
    this.buildSectionsViewModel();
  }

  get displayCompanyName() {
    return this.companyName || this._dynamicCompanyName || 'Company';
  }

  get hasSections() {
    return this.parsedSections && this.parsedSections.length > 0;
  }

  get hasSources() {
    return this.sources && this.sources.length > 0;
  }
}
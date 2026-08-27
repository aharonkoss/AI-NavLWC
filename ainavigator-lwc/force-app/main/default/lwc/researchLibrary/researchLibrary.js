import { LightningElement, api, track } from 'lwc';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';

const TITLE_OVERRIDES = {
  'ucc/lien analysis': 'UCC/Lien Analysis',
  'dot fleet intelligence': 'DOT Fleet Intelligence'
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

function setExpanded(section, expanded) {
  return {
    ...section,
    isExpanded: expanded,
    chevron: expanded ? 'chevron-down' : 'chevron-right',
    ariaExpanded: expanded ? 'true' : 'false'
  };
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
      if (cells.every((c) => /^-+$/.test(c.text))) continue;
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
  @api companyId;

  @track parsedSections = [];
  @track sources = [];
  @track isLoading = true;
  @track error = null;

  connectedCallback() {
    this.loadReport();
  }

  loadReport() {
    if (!this.companyId) {
      this.isLoading = false;
      return;
    }
    this.isLoading = true;
    this.error = null;

    getAiNavigatorReport({ companyId: this.companyId })
      .then((json) => {
        if (!json) {
          this.error = 'Report not yet available for this company.';
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
          this.parsedSections = reportObj.sections.map((sec, idx) => ({
            id: sec.id || `sec-${idx}`,
            title: sec.title,
            content: sec.content,
            renderedRows: parseContentToRows(sec.content),
            isExpanded: idx === 0,
            chevron: idx === 0 ? 'chevron-down' : 'chevron-right',
            ariaExpanded: idx === 0 ? 'true' : 'false'
          }));
        } else {
          const textToParse = reportText || (typeof reportObj === 'string' ? reportObj : '');
          this.parsedSections = this.parseReportIntoSections(textToParse);
        }

        const rawCitations = reportObj?.citations || data.citations || data.sources || [];
        this.buildSourcesFromArray(rawCitations);
      })
      .catch((err) => {
        this.error = `Report Load Failed: ${err?.body?.message || err?.message}`;
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
        isExpanded: isFirst,
        chevron: isFirst ? 'chevron-down' : 'chevron-right',
        ariaExpanded: isFirst ? 'true' : 'false'
      });
    });

    if (sections.length === 0) {
      return [
        {
          id: 'full-report',
          title: 'Full Report',
          renderedRows: parseContentToRows(text),
          isExpanded: true
        }
      ];
    }

    sections.forEach((sec, i) => {
      const start = sec.startIndex + 1;
      const end = i < sections.length - 1 ? sections[i + 1].startIndex : lines.length;
      const content = lines.slice(start, end).join('\n').trim();
      sec.renderedRows = parseContentToRows(content);
    });
    return sections;
  }

  buildSourcesFromArray(raw) {
    this.sources = raw.map((s, idx) => ({
      idx: idx + 1,
      url: typeof s === 'string' ? s : s.url,
      label: typeof s === 'string' ? s : s.label || s.title || s.url
    }));
  }

  handleToggle(event) {
    const id = event.currentTarget.dataset.id;
    this.parsedSections = this.parsedSections.map((s) =>
      s.id === id ? setExpanded(s, !s.isExpanded) : s
    );
  }

  handleExpandAll() {
    this.parsedSections = this.parsedSections.map((s) => setExpanded(s, true));
  }

  handleCollapseAll() {
    this.parsedSections = this.parsedSections.map((s) => setExpanded(s, false));
  }

  get hasSections() {
    return this.parsedSections.length > 0;
  }
  get hasSources() {
    return this.sources.length > 0;
  }
}
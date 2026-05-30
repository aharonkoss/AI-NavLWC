import { LightningElement, api, track } from 'lwc';
import getCompanyRecord from '@salesforce/apex/OpportunityAiNavigatorController.getCompanyRecord';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';

// Utility helper matching the original regex clean-up pipeline
function stripInlineMd(text) {
    if (!text) return text;
    return text
        .replace(/\*\*(.*?)\*\"/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .trim();
}

// Streamlined markdown parsing engine matching companyDetailResearch.js output expectations
function parseContentToRows(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const rows = [];
    let tableHeaderCells = null;
    let tableBodyRows = [];
    let tableStartId = 0;

    function flushTable(idSuffix) {
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
    }

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

        // Table Row matching
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            const cells = trimmed.slice(1, -1).split('|').map(c => ({ text: stripInlineMd(c.trim()) }));
            if (cells.every(c => /^-+$/.test(c.text))) continue; // skip dashes boundary dividers
            if (tableHeaderCells === null) { 
                tableHeaderCells = cells; 
                tableStartId = i; 
            } else { 
                tableBodyRows.push({ id: `tr-${i}`, cells }); 
            }
            continue;
        }

        flushTable(tableStartId);

        // Heading matching (H1 - H4)
        const headingMatch = trimmed.match(/^(#{1,4})\s?(.+)/);
        if (headingMatch) {
            rows.push({ 
                id: `h-${i}`, 
                isHeading: true, 
                level: headingMatch[1].length, 
                text: stripInlineMd(headingMatch[2]) 
            });
            continue;
        }

        // Bullet matching
        const bulletMatch = raw.match(/^(\s*)[-*]\s+(.+)/);
        if (bulletMatch) {
            rows.push({ 
                id: `b-${i}`, 
                isBullet: true, 
                html: stripInlineMd(bulletMatch[2]) 
            });
            continue;
        }

        // Simple text fallback
        rows.push({ id: `t-${i}`, isText: true, html: stripInlineMd(trimmed) });
    }
    flushTable(tableStartId);
    return rows;
}

export default class OpportunityAiNavigator extends LightningElement {
    @api recordId; // Injected on Opportunity Record pages automatically

    @track isLoading = true;
    @track error = null;

    @track companyRecord = null;
    @track parsedSections = [];

    connectedCallback() {
        this.fetchData();
    }

    /**
     * Entrypoint retrieval structure. First gets Opportunity's Company__c record, 
     * then if active/completed pulls the research report directly.
     */
    async fetchData() {
        this.isLoading = true;
        this.error = null;
        this.companyRecord = null;
        this.parsedSections = [];

        try {
            const company = await getCompanyRecord({ opportunityId: this.recordId });
            this.companyRecord = company;

            // Updated status comparison to use case-insensitive logic
            if (company && company.Status__c && company.Status__c.toLowerCase() === 'completed') {
                const reportResponse = await getAiNavigatorReport({ companyId: company.Id });
                if (reportResponse) {
                    let parsedReport;
                    try {
                        parsedReport = JSON.parse(reportResponse);
                    } catch {
                        this.error = 'Report structural data format could not be parsed.';
                        return;
                    }

                    const reportText = parsedReport.reportText ?? 
                                       parsedReport.reporttext ?? 
                                       parsedReport.ainavigatorreport ?? 
                                       (typeof parsedReport.report === 'string' ? parsedReport.report : null);
                    
                    if (reportText) {
                        this.parsedSections = this.parseReportIntoSections(reportText);
                    } else {
                        this.error = 'AI Navigator report text payload is empty.';
                    }
                } else {
                    this.error = 'No report record received from the indexing database.';
                }
            }
        } catch (err) {
            this.error = err?.body?.message || err?.message || 'Failed to communicate with Apex controllers.';
        } finally {
            this.isLoading = false;
        }
    }

    handleRefresh() {
        this.fetchData();
    }

    /**
     * Splits raw markdown report details into designated structural headings
     */
    parseReportIntoSections(text) {
        if (!text) return [];
        const normalized = text.replace(/\r\n/g, '\n');
        const lines = normalized.split('\n');
        const sections = [];
        const seenIds = new Set();

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            const match = trimmed.match(/^(#{1,2})(?!#)\s?(.+)/);
            if (!match) return;
            if (match[1].length === 1) return; // Skip top-level documents titles

            const rawTitle = stripInlineMd(match[2]).replace(/^#+\s*/, '');
            const id = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-');
            
            if (seenIds.has(id)) return;
            seenIds.add(id);

            sections.push({
                id,
                title: rawTitle,
                startIndex: index,
                content: '',
                renderedRows: []
            });
        });

        // Parse content boundaries between headings
        for (let i = 0; i < sections.length; i++) {
            const start = sections[i].startIndex + 1;
            const end = i < sections.length - 1 ? sections[i + 1].startIndex : lines.length;
            const content = lines.slice(start, end).join('\n').trim();
            sections[i].content = content;
            sections[i].renderedRows = parseContentToRows(content);
        }
        return sections;
    }

    // ─────────────────────────────────────────────────────────────
    // UI Getters
    // ─────────────────────────────────────────────────────────────

    get showNoRecordState() {
        return !this.isLoading && !this.companyRecord;
    }

    // Case-insensitive status verification
    get showProcessingState() {
        return !this.isLoading && 
               this.companyRecord && 
               (!this.companyRecord.Status__c || this.companyRecord.Status__c.toLowerCase() !== 'completed');
    }

    // Case-insensitive status verification
    get showCompletedState() {
        return !this.isLoading && 
               this.companyRecord && 
               this.companyRecord.Status__c && 
               this.companyRecord.Status__c.toLowerCase() === 'completed';
    }

    get companyStatus() {
        return this.companyRecord ? this.companyRecord.Status__c : '';
    }

    /**
     * Extracts only the matching 'Company Overview' section from the array of parsed sections
     */
    get overviewSection() {
        if (this.parsedSections.length === 0) return null;
        const matched = this.parsedSections.find(sec => 
            sec.title.toLowerCase().includes('company overview')
        );
        // Fallback to the first parsed section if a strict title match fails
        return matched || this.parsedSections[0];
    }
}
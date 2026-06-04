import { LightningElement, api, track } from 'lwc';
import getCompanyRecord from '@salesforce/apex/OpportunityAiNavigatorController.getCompanyRecord';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';
import getUccFilings from '@salesforce/apex/CompanyDetailController.getUccFilings';

// Strips out brackets, citation numbers, and tildes [1]
function cleanDisplayData(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/\[\d+\]/g, '') // Removes [1], [2], [12], etc.
        .replace(/~/g, '')       // Removes tildes (~)
        .replace(/\s+/g, ' ')    // Condenses multiple whitespaces
        .trim();
}

function stripInlineMd(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`/g, '')
        .trim();
}

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

        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            const cells = trimmed.slice(1, -1).split('|').map(c => ({ text: stripInlineMd(c.trim()) }));
            if (cells.every(c => /^-+$/.test(c.text))) continue;
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
                text: stripInlineMd(headingMatch[2]) 
            });
            continue;
        }

        const bulletMatch = raw.match(/^(\s*)[-*]\s+(.+)/);
        if (bulletMatch) {
            rows.push({ 
                id: `b-${i}`, 
                isBullet: true, 
                html: stripInlineMd(bulletMatch[2]) 
            });
            continue;
        }

        rows.push({ id: `t-${i}`, isText: true, html: stripInlineMd(trimmed) });
    }
    flushTable(tableStartId);
    return rows;
}

function formatDate(d) {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return d; }
}

export default class OpportunityAiNavigator extends LightningElement {
    @api recordId;
    @api objectApiName;

    @track isLoading = true;
    @track error = null;

    @track companyRecord = null;
    @track parsedSections = [];
    
    // Updated to track an array of objects instead of a joined string [1]
    @track activeUccBankRelationships = [];

    // Summary Metric Variables
    @track summaryEmployees = 'N/A';
    @track summaryRevenue = 'N/A';
    @track sicCodeRaw = '';
    @track naicsCodeRaw = '';

    // Leadership Variables
    @track leadershipExecutives = [];

    connectedCallback() {
        this.fetchData();
    }

    async fetchData() {
        this.isLoading = true;
        this.error = null;
        this.companyRecord = null;
        this.parsedSections = [];
        this.activeUccBankRelationships = [];
        
        this.summaryEmployees = 'N/A';
        this.summaryRevenue = 'N/A';
        this.sicCodeRaw = '';
        this.naicsCodeRaw = '';
        this.leadershipExecutives = [];

        try {
            // 1. Fetch Company__c using universally adaptive controller
            const company = await getCompanyRecord({ recordId: this.recordId });
            this.companyRecord = company;

            if (company && company.Status__c && company.Status__c.toLowerCase() === 'completed') {
                
                // Fire concurrent fetches for Report and UCC filings
                const [reportResponse, uccResponse] = await Promise.all([
                    getAiNavigatorReport({ companyId: company.Id }),
                    getUccFilings({ companyId: company.Id })
                ]);

                // 2. Process AI Navigator Report
                if (reportResponse) {
                    let parsedReport = JSON.parse(reportResponse);
                    
                    const reportText = parsedReport.reportText ?? 
                                       parsedReport.reporttext ?? 
                                       parsedReport.ainavigatorreport ?? 
                                       (typeof parsedReport.report === 'string' ? parsedReport.report : null);
                    
                    if (reportText) {
                        this.parsedSections = this.parseReportIntoSections(reportText);
                        this.extractSummaryMetrics(); // Scan tables to pull Employees, Revenue, SIC, and NAICS Code
                    }

                    // Process Leadership Contacts from payload
                    const leaders = parsedReport?.leadership?.leaders ?? parsedReport?.leaders ?? [];
                    this.buildLeadershipViewModel(leaders);
                }

                // 3. Process UCC Filings to find active banking secured parties
                if (uccResponse) {
                    let parsedUcc = JSON.parse(uccResponse);
                    if (Array.isArray(parsedUcc)) parsedUcc = parsedUcc[0] ?? null;

                    const filings = parsedUcc?.uccFilings ?? [];
                    const activeBanks = [];

                    filings.forEach(f => {
                        const status = (f.status || '').toLowerCase();
                        if (status === 'active') {
                            const securedParties = f.securedParties ?? [];
                            securedParties.forEach(sp => {
                                const name = sp.name ?? sp.orgName ?? '';
                                if (name && !activeBanks.includes(name)) {
                                    activeBanks.push(cleanDisplayData(name));
                                }
                            });
                            if (f.securedPartyName && !activeBanks.includes(f.securedPartyName)) {
                                activeBanks.push(cleanDisplayData(f.securedPartyName));
                            }
                        }
                    });

                    // Format banks into uniquely keyed list objects [1]
                    if (activeBanks.length > 0) {
                        this.activeUccBankRelationships = activeBanks.map((bank, index) => ({
                            id: `bank-${index}`,
                            name: bank
                        }));
                    }
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
            if (match[1].length === 1) return;

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

        for (let i = 0; i < sections.length; i++) {
            const start = sections[i].startIndex + 1;
            const end = i < sections.length - 1 ? sections[i + 1].startIndex : lines.length;
            const content = lines.slice(start, end).join('\n').trim();
            sections[i].content = content;
            sections[i].renderedRows = parseContentToRows(content);
        }
        return sections;
    }

    /**
     * Scans the Company Overview parsed tables using word-boundary RegEx tests
     * to safely extract and clean Employees, Revenue, SIC, and NAICS values [1].
     */
    extractSummaryMetrics() {
        const overview = this.overviewSection;
        if (!overview) return;

        overview.renderedRows.forEach(row => {
            if (row.isTable) {
                row.bodyRows.forEach(brow => {
                    const attribute = brow.cells[0]?.text ?? '';
                    const detail = brow.cells[1]?.text ?? '';

                    if (attribute && detail) {
                        const lowerAttr = attribute.toLowerCase();
                        
                        // Strict word-boundary checks prevent false matching on substrings like 'physicians'
                        if (/\bemployees?\b/.test(lowerAttr)) {
                            this.summaryEmployees = cleanDisplayData(detail);
                        } else if (/\brevenue\b/.test(lowerAttr)) {
                            this.summaryRevenue = cleanDisplayData(detail);
                        } else if (/\bsic\b/.test(lowerAttr)) {
                            this.sicCodeRaw = cleanDisplayData(detail);
                        } else if (/\bnaics\b/.test(lowerAttr)) {
                            this.naicsCodeRaw = cleanDisplayData(detail);
                        }
                    }
                });
            }
        });
    }

    /**
     * Maps raw executive payload into contact UI cards
     */
    buildLeadershipViewModel(leaders) {
        if (!Array.isArray(leaders) || leaders.length === 0) {
            this.leadershipExecutives = [];
            return;
        }

        this.leadershipExecutives = leaders.map((l, index) => {
            const name = cleanDisplayData(l.fullName ?? l.name ?? '');
            
            const initials = name
                .split(' ')
                .filter(Boolean)
                .map(w => w[0].toUpperCase())
                .slice(0, 2)
                .join('');

            const sourceMap = {
                rocketreach: { label: 'Verified', cls: 'ldr-badge ldr-badge--high' },
                perplexity: { label: 'Unverified', cls: 'ldr-badge ldr-badge--low' },
            };
            const conf = sourceMap[l.source] ?? { label: 'Unverified', cls: 'ldr-badge ldr-badge--low' };

            const emails = (l.emails ?? []).map(e => ({
                email: cleanDisplayData(e.email),
                type: e.email_type ?? e.type ?? 'professional',
                grade: e.grade ?? '',
            }));
            const recommendedEmail = emails.find(e => e.grade === 'A' || e.grade === 'A-') ?? emails[0] ?? null;

            const phones = (l.phones ?? []).map(p => ({
                number: cleanDisplayData(p.number ?? p.phone ?? ''),
                type: p.type ?? '',
                recommended: !!p.recommended,
            }));

            const jobHistory = (l.jobHistory ?? []).map((j, jIdx) => ({
                key: `jh-${index}-${jIdx}`,
                title: cleanDisplayData(j.title ?? ''),
                company: cleanDisplayData(j.company ?? ''),
                startDate: formatDate(j.startDate),
                endDate: j.isCurrent ? 'Present' : formatDate(j.endDate),
                isCurrent: !!j.isCurrent,
                rowClass: j.isCurrent ? 'ldr-job-row ldr-job-row--current' : 'ldr-job-row',
            }));

            const education = (l.education ?? []).map((e, eIdx) => ({
                key: `edu-${index}-${eIdx}`,
                school: cleanDisplayData(e.school ?? ''),
                degree: cleanDisplayData(e.degree ?? ''),
                major: cleanDisplayData(e.major ?? ''),
            }));

            const linkedInUrl = l.linkedInUrl ?? l.links?.linkedin ?? null;
            const twitterUrl = l.twitterUrl ?? l.links?.twitter ?? null;

            return {
                id: String(l.rocketReachId ?? name ?? index),
                fullName: name,
                designation: cleanDisplayData(l.designation ?? l.title ?? ''),
                initials,
                location: cleanDisplayData(l.location ?? [l.city, l.state, l.country].filter(Boolean).join(', ') ?? ''),
                profilePicUrl: l.profilePicUrl ?? null,
                hasProfilePic: !!l.profilePicUrl,
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

                linkedInUrl,
                hasLinkedIn: !!linkedInUrl,
                twitterUrl,
                hasTwitter: !!twitterUrl,
            };
        }).filter(e => e.fullName);
    }

    // ─────────────────────────────────────────────────────────────
    // UI Getters
    // ─────────────────────────────────────────────────────────────

    get subTitleHeader() {
        return 'Account-level Firmographic Insights & Contacts';
    }

    get isAccountContext() {
        return true;
    }

    get isContactContext() {
        return false;
    }

    get showNoRecordState() {
        return !this.isLoading && !this.companyRecord;
    }

    get showProcessingState() {
        return !this.isLoading && 
               this.companyRecord && 
               (!this.companyRecord.Status__c || this.companyRecord.Status__c.toLowerCase() !== 'completed');
    }

    get showCompletedState() {
        return !this.isLoading && 
               this.companyRecord && 
               this.companyRecord.Status__c && 
               this.companyRecord.Status__c.toLowerCase() === 'completed';
    }

    get companyStatus() {
        return this.companyRecord ? this.companyRecord.Status__c : '';
    }

    get hasBankingRelationships() {
        return this.activeUccBankRelationships && this.activeUccBankRelationships.length > 0;
    }

    get currentBankingRelationship() {
        return this.activeUccBankRelationships;
    }

    /**
     * Extracts numerical codes (or returns raw values) to build a clean
     * combined 'SIC Code / NAICS Code' display string.
     */
    get summarySicNaics() {
        const parseCode = (rawStr) => {
            if (!rawStr) return '';
            const match = rawStr.match(/^\d+/);
            return match ? match[0] : rawStr.trim();
        };

        const sic = parseCode(this.sicCodeRaw);
        const naics = parseCode(this.naicsCodeRaw);

        if (sic && naics) {
            return `${sic} / ${naics}`;
        }
        return sic || naics || 'N/A';
    }

    get overviewSection() {
        if (this.parsedSections.length === 0) return null;
        const matched = this.parsedSections.find(sec => 
            sec.title.toLowerCase().includes('company overview')
        );
        return matched || this.parsedSections[0];
    }

    get leadershipCountLabel() {
        const count = this.leadershipExecutives.length;
        return `${count} contact${count !== 1 ? 's' : ''}`;
    }

    get leadershipHasExecutives() {
        return this.leadershipExecutives.length > 0;
    }
}
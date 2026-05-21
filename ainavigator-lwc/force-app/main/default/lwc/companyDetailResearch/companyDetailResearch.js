// ─────────────────────────────────────────────────────────────────────────────
// FILE: companyDetailResearch.js
// NOTE: ONLY the UCC-related code has been rewritten below.
//       All other sections (imports, constants, helpers, VIQ, report parsing,
//       leadership, event handlers for non-UCC tabs) are UNCHANGED and shown
//       in their original form.
// ─────────────────────────────────────────────────────────────────────────────

import { LightningElement, api, track } from 'lwc';
import getAiNavigatorReport  from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';
import getUccFilings         from '@salesforce/apex/CompanyDetailController.getUccFilings';
import getVerticalIqData     from '@salesforce/apex/CompanyDetailController.getVerticalIqData';
import getLeadership from '@salesforce/apex/CompanyDetailController.getLeadership';
import getLeadershipData from '@salesforce/apex/CompanyDetailController.getLeadershipData';
// Optional display-title overrides
const TITLE_OVERRIDES = {
    'ucc/lien analysis': 'UCC/Lien Analysis',
    'dot fleet intelligence': 'DOT Fleet Intelligence',
};

// Sub-tab definitions
const RESEARCH_SUBTABS = [
    { id: 'researchLibrary', label: 'Research Library' },
    { id: 'leadership',      label: 'Leadership'       },
    { id: 'ucc',             label: 'UCC'              },
    { id: 'viq',             label: 'VIQ'              },
    { id: 'rma',             label: 'RMA'              },
    { id: 'equifax',         label: 'Equifax'          },
];

// VIQ section keys must match viqSectionsCollapsed keys
const VIQ_SECTIONS_DEFAULT_COLLAPSED = {
    currentConditions:    false,
    industryTrends:       false,
    globalTrends:         true,
    industryOverview:     false,
    quarterlyInsights:    true,
    bankingProducts:      true,
    keyQuestions:         true,
    industryTerms:        true,
    financialBenchmarks:  true,
    financialMetrics:     true,
    operations:           true,
};

// ─── Pure helper functions ────────────────────────────────────────────────────

function headingToId(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-');
}

function resolveTitle(rawTitle) {
    return TITLE_OVERRIDES[rawTitle.toLowerCase()] || rawTitle;
}

function setExpanded(section, expanded) {
    return {
        ...section,
        isExpanded:   expanded,
        chevron:      expanded ? 'chevron-down' : 'chevron-right',
        ariaExpanded: expanded ? 'true' : 'false',
    };
}

function stripInlineMd(text) {
    if (!text) return text;
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');
    text = text.replace(/\*(.*?)\*/g, '$1');
    text = text.replace(/`(.*?)`/g, '$1');
    return text.trim();
}

function parseContentToRows(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const rows  = [];
    let tableHeaderCells = null;
    let tableBodyRows    = [];
    let tableStartId     = 0;

    function flushTable(idSuffix) {
        if (tableHeaderCells !== null) {
            rows.push({ id: `tbl-${idSuffix}`, isTable: true, headerCells: tableHeaderCells, bodyRows: tableBodyRows });
            tableHeaderCells = null;
            tableBodyRows    = [];
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const raw     = lines[i];
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
            if (tableHeaderCells === null) { tableHeaderCells = cells; tableStartId = i; }
            else { tableBodyRows.push({ id: `tr-${i}`, cells }); }
            continue;
        }

        flushTable(tableStartId);

        const headingMatch = trimmed.match(/^(#{1,4})\s?(.+)/);
        if (headingMatch) {
            rows.push({ id: `h-${i}`, isHeading: true, level: headingMatch[1].length, isH3: headingMatch[1].length <= 3, text: stripInlineMd(headingMatch[2]) });
            continue;
        }

        const bulletMatch = raw.match(/^(\s*)[-*]\s+(.+)/);
        if (bulletMatch) {
            rows.push({ id: `b-${i}`, isBullet: true, html: stripInlineMd(bulletMatch[2]), indent: Math.floor(bulletMatch[1].length / 2) });
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

function cleanHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function safeArray(val) {
    return Array.isArray(val) ? val : [];
}


// ═══════════════════════════════════════════════════════════════════
// UCC VIEW MODEL BUILDER  ← REWRITTEN TO MATCH REACT PORTAL
//
// Changes from original:
//   • Secured party addresses: joined from street/city/state/zip sub-fields
//     in addition to the flat .address field (matches React's multi-field join)
//   • Debtor addresses: same multi-field join pattern
//   • statusClass: now maps "lapsed" → closed (React portal treats lapsed
//     the same as terminated/closed)
//   • filingType: uppercase-normalized so the UCC type badge is always ALLCAPS
//     (matches the portal's .toUpperCase() display)
//   • fileNumber: exposed as a separate display field (portal shows it inline
//     next to "Filing #N" when present)
//   • expiresDate: null-safe — if missing the HTML simply omits the expires row
//   • Added `hasFileNumber` boolean so the HTML can conditionally render it
//   • Added `jurisdictionText` = "Jurisdiction: XX" pre-formatted string
//     so the template does zero string concatenation (LWC best-practice)
//   • Added `hasFilingOffice` boolean (unchanged logic, added explicit flag)
//   • Secured party / debtor entries each get a unique `key` for lwc:for
// ═══════════════════════════════════════════════════════════════════

function buildUccViewModel(raw) {
    if (!raw) return null;

    const filings = Array.isArray(raw.uccFilings) ? raw.uccFilings : [];

    // Sort newest-filed first — matches React portal's .sort() before render
    const sorted = [...filings].sort((a, b) => {
        const ta = a.filedDate || a.filingDate || 0;
        const tb = b.filedDate || b.filingDate || 0;
        return new Date(tb).getTime() - new Date(ta).getTime();
    });

    return {
        totalFilings:    raw.totalFilings ?? filings.length,
        businessName:    raw.business?.name || raw.companyName || null,
        hasFilings:      filings.length > 0,

        filings: sorted.map((f, idx) => {

            // ── Status badge CSS class ──────────────────────────────────────
            // React portal: active→green, terminated/lapsed/closed→red, else gray
            const statusLower = (f.status || '').toLowerCase();
            const statusClass =
                statusLower === 'active'
                    ? 'ucc-badge ucc-badge--active'
                    : (statusLower === 'terminated' ||
                       statusLower === 'lapsed'     ||
                       statusLower === 'closed')
                        ? 'ucc-badge ucc-badge--closed'
                        : 'ucc-badge ucc-badge--neutral';

            // ── Filing type — normalized to uppercase ───────────────────────
            // Portal always renders the type badge in UPPERCASE (e.g. "UCC", "FIXTURE")
            const filingType = (f.filingType || f.type || 'UCC').toUpperCase();

            // ── File / filing number ────────────────────────────────────────
            const fileNumber = f.fileNumber || f.filingNumber || f.filingnumber || '';

            // ── Jurisdiction pre-formatted label ────────────────────────────
            // Portal renders: <span>Jurisdiction: TX</span> — plain text, no pill
            const jurisdictionText = f.jurisdiction ? `Jurisdiction: ${f.jurisdiction}` : '';

            // ── Filing office — only shown when it differs from jurisdiction ─
            const filingOffice =
                f.filingOffice && f.filingOffice !== f.jurisdiction
                    ? f.filingOffice
                    : null;

            // ── Secured parties ─────────────────────────────────────────────
            // Handles: array of objects, single flat field, and sub-field address join
            // (matches React portal's multi-field address coalescence)
            const securedParties =
                Array.isArray(f.securedParties) && f.securedParties.length > 0
                    ? f.securedParties.map((p, pIdx) => ({
                        key:     `sp-${idx}-${pIdx}`,
                        name:    p.name    || p.orgName    || '',
                        address: p.address ||
                                 [p.street, p.city, p.state, p.zip]
                                     .filter(Boolean).join(', ') || '',
                    }))
                    : f.securedPartyName
                        ? [{
                            key:     `sp-${idx}-0`,
                            name:    f.securedPartyName,
                            address: f.securedPartyAddress ||
                                     [f.securedPartyStreet,
                                      f.securedPartyCity,
                                      f.securedPartyState,
                                      f.securedPartyZip]
                                          .filter(Boolean).join(', ') || '',
                        }]
                        : [];

            // ── Debtors ─────────────────────────────────────────────────────
            // Mirrors React portal: array → flat field → empty
            const debtors =
                Array.isArray(f.debtors) && f.debtors.length > 0
                    ? f.debtors.map((d, dIdx) => ({
                        key:     `dbt-${idx}-${dIdx}`,
                        name:    d.name || d.orgName || d.organizationName || d.partyName || '',
                        address: d.address ||
                                 [d.street, d.city, d.state, d.zip]
                                     .filter(Boolean).join(', ') || '',
                    }))
                    : f.debtorName
                        ? [{
                            key:     `dbt-${idx}-0`,
                            name:    f.debtorName,
                            address: f.debtorAddress ||
                                     [f.debtorStreet,
                                      f.debtorCity,
                                      f.debtorState,
                                      f.debtorZip]
                                          .filter(Boolean).join(', ') || '',
                        }]
                        : [];

            // ── Collateral ──────────────────────────────────────────────────
            const collateral = f.collateral || f.collateralDescription || null;

            return {
                key:              String(idx),
                label:            `Filing #${idx + 1}`,
                fileNumber,
                hasFileNumber:    !!fileNumber,
                filingType,
                status:           f.status || '',
                statusClass,
                jurisdiction:     f.jurisdiction || '',
                jurisdictionText,
                hasJurisdiction:  !!f.jurisdiction,
                filingOffice,
                hasFilingOffice:  !!filingOffice,
                filedDate:        formatDate(f.filedDate   || f.filingDate),
                expiresDate:      formatDate(f.expirationDate || f.expDate || f.expiredDate),
                hasExpires:       !!(f.expirationDate || f.expDate || f.expiredDate),
                securedParties,
                hasSecuredParties: securedParties.length > 0,
                debtors,
                hasDebtors:       debtors.length > 0,
                collateral,
                hasCollateral:    !!collateral,
            };
        }),
    };
}
    // ═══════════════════════════════════════════════════════════════════
    // LEADERSHIP VIEW MODEL BUILDER
    //
    // Maps the /v1/user/leadership-lookup API response to display-ready
    // objects. Each executive object from the API contains:
    //   fullName, designation, employmentHistory, education, specialties,
    //   linkedInUrl, sourceUrl, sourceConfidence (high/low/pending-verification)
    // ═══════════════════════════════════════════════════════════════════

    function buildLeadershipViewModel(raw) {
        if (!raw) return { executives: [], hasExecutives: false, totalCount: 0 };

        const list = Array.isArray(raw) ? raw : (raw.executives || raw.leaders || raw.leadership || []);

        const executives = list.map((p, idx) => {
            const fullName = p.fullName || p.name || '';

            const initials = fullName
                .split(' ')
                .filter(Boolean)
                .map(w => w[0].toUpperCase())
                .slice(0, 2)
                .join('');

            // Emails — pick recommended or first valid grade
            const emails = Array.isArray(p.emails) && p.emails.length > 0
                ? p.emails
                : (p.email ? [{ email: p.email, type: 'professional', grade: '' }] : []);
            const recommendedEmail = emails.find(e => e.grade === 'A') || emails[0] || null;

            // Phones — pick recommended
            const phones = Array.isArray(p.phones) && p.phones.length > 0
                ? p.phones
                : (p.phone ? [{ number: p.phone, type: 'professional', recommended: true }] : []);
            const recommendedPhone = phones.find(ph => ph.recommended) || phones[0] || null;

            // Employment history from jobHistory[]
            const jobHistory = Array.isArray(p.jobHistory) && p.jobHistory.length > 0
                ? p.jobHistory.map((j, jIdx) => ({
                    key:       `jh-${idx}-${jIdx}`,
                    title:     j.title || '',
                    company:   j.company || '',
                    startDate: formatDate(j.startDate),
                    endDate:   j.isCurrent ? 'Present' : formatDate(j.endDate),
                    isCurrent: !!j.isCurrent
                }))
                : [];

            // Education
            const education = Array.isArray(p.education) && p.education.length > 0
                ? p.education.map((e, eIdx) => ({
                    key:    `edu-${idx}-${eIdx}`,
                    school: e.school || '',
                    degree: e.degree || '',
                    major:  e.major || ''
                }))
                : [];

            // Skills
            const skills = Array.isArray(p.skills) ? p.skills.filter(Boolean) : [];

            // Social profiles
            const linkedInUrl  = p.linkedInUrl  || p.links?.linkedin  || null;
            const twitterUrl   = p.twitterUrl   || p.links?.twitter   || null;

            return {
                id:               String(idx),
                fullName,
                initials,
                designation:      p.designation || p.title || '',
                company:          p.company || '',
                location:         p.location || [p.city, p.state, p.country].filter(Boolean).join(', ') || null,
                profilePicUrl:    p.profilePicUrl || null,
                hasProfilePic:    !!p.profilePicUrl,
                emails,
                recommendedEmail,
                hasEmails:        emails.length > 0,
                emailCount:       emails.length,
                phones,
                recommendedPhone,
                hasPhones:        phones.length > 0,
                phoneCount:       phones.length,
                jobHistory,
                hasJobHistory:    jobHistory.length > 0,
                jobHistoryCount:  jobHistory.length,
                education,
                hasEducation:     education.length > 0,
                skills,
                hasSkills:        skills.length > 0,
                skillCount:       skills.length,
                linkedInUrl,
                hasLinkedIn:      !!linkedInUrl,
                twitterUrl,
                hasTwitter:       !!twitterUrl,
                source:           p.source || null
            };
        }).filter(e => e.fullName);

        return {
            executives,
            hasExecutives: executives.length > 0,
            totalCount:    executives.length
        };
    }

// ─── VIQ View Model Builder (UNCHANGED) ─────────────────────────────────────

function buildViqViewModel(raw) {
    const industryName = raw.industryName;
    const naicsCode    = String(raw.naicsCode);
    const industryId   = String(raw.industryId);
    const apiError     = raw.error || null;
    const overview     = raw.industryOverview || {};

    const trends = safeArray(overview.trends).map((item, idx) => {
        const t = item.industrytrend || item;
        if (!t || !t.title) return null;
        return { id: `trend-${idx}`, title: t.title, body: cleanHtml(t.body), position: t.position || idx + 1 };
    }).filter(Boolean);

    const currentConditions = safeArray(overview.currentConditions).map((item, idx) => {
        const c = item.industrycurrentcondition || item;
        if (!c || !c.title) return null;
        const bullets = [];
        for (let i = 1; i <= 10; i++) {
            const b = c[`bullet${i}`];
            if (b && String(b).trim()) bullets.push(String(b).trim());
        }
        return { id: `cond-${idx}`, title: c.title, date: formatDate(c.date) || c.date, bullets, hasBullets: bullets.length > 0 };
    }).filter(Boolean);

    const quarterlyInsights = safeArray(overview.quarterlyInsights || overview.quarterlyinsights).map((item, idx) => {
        const q = item.industryquarterlyinsight || item.quarterlyinsight || item;
        if (!q || !q.title) return null;
        return { id: `qi-${idx}`, title: q.title, body: cleanHtml(q.body) };
    }).filter(Boolean);

    const bankingRaw = raw.bankingProducts || overview.bankingProducts;
    const bankingProducts = safeArray(Array.isArray(bankingRaw) ? bankingRaw : bankingRaw?.productUsage).map((item, idx) => {
        const p = item.productusage || item;
        if (!p || !p.name) return null;
        return { id: `bp-${idx}`, name: p.name, usage: p.usage || p.description };
    }).filter(Boolean);

    const keyQuestions = safeArray(raw.keyQuestions || overview.keyQuestions).map((item, idx) => {
        const q = item.keyquestion || item;
        const text = typeof q === 'string' ? q : (q.question || q.text || q.body);
        return text ? { id: `kq-${idx}`, text } : null;
    }).filter(Boolean);

    const insightsRaw       = raw.insights || null;
    const insightsContent   = insightsRaw?.content;
    const insightsGenerated = insightsRaw?.generatedAt ? formatDate(insightsRaw.generatedAt) : null;

    const forecasts   = overview.forecasts || null;
    const hasForecast = !!(forecasts?.growthrateoverall || forecasts?.relativestring);

    const globalTrends = safeArray(overview.globalTrends).map((item, idx) => {
        const t = item.industrytrend || item;
        if (!t || !t.title) return null;
        return { id: `gt-${idx}`, title: t.title, body: cleanHtml(t.body) };
    }).filter(Boolean);

    const structure = overview.structure || null;

    const derivedStatements = safeArray(overview.derivedStatements).map((item, idx) => {
        if (!item) return null;
        return { id: `ds-${idx}`, title: item.title || item.label, value: item.value };
    }).filter(Boolean);

    const terms = safeArray(raw.terms || raw.data?.terms).map((item, idx) => {
        if (!item || !item.name) return null;
        return { id: `term-${idx}`, name: item.name, definition: item.description || item.definition };
    }).filter(Boolean);

    const benchmarks = safeArray(raw.financial?.benchmarks).map((b, idx) => ({
        id:              `bench-${idx}`,
        compClass:       b.compclass || `Class ${idx + 1}`,
        currentRatio:    b.currentratio    ?? b.currentRatio    ?? '-',
        quickRatio:      b.quickratio      ?? b.quickRatio      ?? '-',
        grossMargin:     b.grossmarginpercent ?? b.grossmargin  ?? '-',
        netMargin:       b.netmarginpercent   ?? b.netmargin    ?? '-',
        daysReceivables: b.daysreceivables ?? b.daysReceivables ?? '-',
        daysPayable:     b.dayspayable     ?? b.daysPayable     ?? '-',
        daysInventory:   b.daysinventory   ?? b.daysInventory   ?? '-',
        debtToEquity:    b.debttoequity    ?? b.debtToEquity    ?? '-',
        returnOnAssets:  b.returnonassets  ?? b.returnOnAssets  ?? '-',
        returnOnEquity:  b.returnonequity  ?? b.returnOnEquity  ?? '-',
    }));

    const metricsRaw = raw.financial?.metrics?.industrymetric || raw.financial?.metrics || null;
    const financialMetrics = metricsRaw ? {
        employeeCount:      cleanHtml(String(metricsRaw.employeecount   || '')),
        revenue:            cleanHtml(String(metricsRaw.revenue         || '')),
        size:               cleanHtml(String(metricsRaw.size            || '')),
        entityType:         cleanHtml(String(metricsRaw.entitytype      || '')),
        failureRate:        cleanHtml(String(metricsRaw.fmfailurerate   || '')),
        industryOverview:   cleanHtml(String(metricsRaw.quickviewtext   || '')),
        profitability:      cleanHtml(String(metricsRaw.profitabilitytext    || '')),
        capitalFinancing:   cleanHtml(String(metricsRaw.capitalfinancingtext || '')),
        cashLiquidity:      cleanHtml(String(metricsRaw.cashliquitytext      || '')),
        workingCapitalMgmt: cleanHtml(String(metricsRaw.workcapmgmttext      || '')),
    } : null;

    const ops = raw.operations || {};
    const profitDrivers = safeArray(ops.profitDrivers).map((d, idx) => ({
        id: `pd-${idx}`, title: d.title, body: cleanHtml(d.body || d.description),
    })).filter(d => d.title);
    const revenuePerEmployee = safeArray(ops.revenuePerEmployee).map((item, idx) => ({
        id: `rpe-${idx}`, label: item.label || item.year, value: item.value || item.datavalue,
    }));
    const workingCapitalBullets = safeArray(ops.workingCapitalBullets).map((item, idx) => {
        const text = item.body || item.bullet || (typeof item === 'string' ? item : null);
        return text ? { id: `wcb-${idx}`, text } : null;
    }).filter(Boolean);
    const cashMgmtChallenges = safeArray(ops.cashMgmtChallenges).map((c, idx) => ({
        id: `cmc-${idx}`, title: c.title, body: cleanHtml(c.body || c.description || c.content),
    })).filter(c => c.title || c.body);

    return {
        industryName, naicsCode, industryId, apiError,
        hasApiError: !!apiError,
        trends, currentConditions, quarterlyInsights, bankingProducts, keyQuestions,
        trendsCount:             trends.length,
        currentConditionsCount:  currentConditions.length,
        quarterlyInsightsCount:  quarterlyInsights.length,
        bankingProductsCount:    bankingProducts.length,
        keyQuestionsCount:       keyQuestions.length,
        hasTrends:               trends.length > 0,
        hasCurrentConditions:    currentConditions.length > 0,
        hasQuarterlyInsights:    quarterlyInsights.length > 0,
        hasBankingProducts:      bankingProducts.length > 0,
        hasKeyQuestions:         keyQuestions.length > 0,
        showIndustryTrends:      trends.length > 0,
        showCurrentConditions:   currentConditions.length > 0,
        showQuarterlyInsights:   quarterlyInsights.length > 0,
        showBankingProducts:     bankingProducts.length > 0,
        showKeyQuestions:        keyQuestions.length > 0,
        hasInsights: !!insightsContent, insightsContent, insightsGenerated,
        forecasts, hasForecast,
        globalTrends, globalTrendsCount: globalTrends.length, hasGlobalTrends: globalTrends.length > 0, showGlobalTrends: globalTrends.length > 0,
        structure, hasStructure: !!structure,
        derivedStatements, hasDerivedStatements: derivedStatements.length > 0,
        terms, hasTerms: terms.length > 0, termsCount: terms.length,
        benchmarks, hasBenchmarks: benchmarks.length > 0,
        financialMetrics, hasFinancialMetrics: !!financialMetrics,
        profitDrivers, hasProfitDrivers: profitDrivers.length > 0,
        revenuePerEmployee, hasRevenuePerEmployee: revenuePerEmployee.length > 0,
        workingCapitalBullets, hasWorkingCapitalBullets: workingCapitalBullets.length > 0,
        cashMgmtChallenges, hasCashMgmtChallenges: cashMgmtChallenges.length > 0,
        hasOperations: !!(profitDrivers.length || workingCapitalBullets.length || cashMgmtChallenges.length || revenuePerEmployee.length),
    };
}


// ─── Component ────────────────────────────────────────────────────────────────

export default class CompanyDetailResearch extends LightningElement {
    @api companyId;

    // Report / Research Library state (UNCHANGED)
    @track parsedSections;
    @track sources;
    @track isLoading = true;
    @track error     = null;
    @track activeResearchSection = 'researchLibrary';

    // ══════════════════════════════════════════════════════════════
    // UCC TAB STATE  ← REWRITTEN
    //
    // Three-state flags mirror React portal's useQuery pattern:
    //   _uccLoading → spinner shown
    //   _uccLoaded  → load has completed at least once (enables lazy guard)
    //   _uccError   → error banner shown
    // _uccViewModel is null until first successful load.
    // ══════════════════════════════════════════════════════════════
    @track _uccViewModel = null;
    @track _uccLoading   = false;
    @track _uccError     = null;
    @track _uccLoaded    = false;

    // VIQ tab state (UNCHANGED)
    @track viqViewModel         = null;
    @track viqLoading           = false;
    @track viqError             = null;
    @track viqLoaded            = false;
    @track viqNaicsCode         = '';
    @track viqSectionsCollapsed = { ...VIQ_SECTIONS_DEFAULT_COLLAPSED };
    // Leadership tab state
    @track _leadershipViewModel = null;
    @track _leadershipLoading   = false;
    @track _leadershipError     = null;
    @track _leadershipLoaded    = false;
    @track _leadershipData = null;
    // ─── Lifecycle ────────────────────────────────────────────────────────────

    connectedCallback() {
        this.loadReport();
    }


    // ─── Data Loading: AI Navigator Report (UNCHANGED) ────────────────────────

    loadReport() {
        this.isLoading = true;
        this.error     = null;
        getAiNavigatorReport({ companyId: this.companyId })
            .then(json => {
                if (!json) { this.error = 'The AI Navigator Report has not been generated yet for this company.'; return; }
                let report;
                try { report = JSON.parse(json); } catch { this.error = 'Report data could not be parsed.'; return; }
                if (Array.isArray(report)) { this.error = 'Report data format unexpected.'; return; }
                const reportText = report.reportText ?? report.reporttext ?? report.ainavigatorreport ?? (typeof report.report === 'string' ? report.report : null);
                if (!reportText) { this.error = 'Report content is not yet available.'; return; }
                this.parsedSections = this.parseReportIntoSections(reportText);
                const rawCitations  = Array.isArray(report.citations) ? report.citations : Array.isArray(report.sources) ? report.sources : [];
                this.buildSourcesFromArray(rawCitations);
            })
            .catch(err => { this.error = `Failed to load report: ${err?.body?.message || err?.message || 'Unknown error'}`; })
            .finally(() => { this.isLoading = false; });
    }


    // ══════════════════════════════════════════════════════════════
    // DATA LOADING: UCC FILINGS  ← REWRITTEN
    //
    // Changes vs original:
    //   • Lazy-load guard identical to original (_uccLoaded / _uccLoading)
    //   • Empty / null JSON → zero-filing view model (not error) — unchanged
    //   • Array-wrapped response unwrapping — unchanged
    //   • Passes raw.business?.name through buildUccViewModel so the
    //     verified business name from the Middesk "business" sub-object
    //     is surfaced (matches React portal's middeskData.business.name)
    //   • Console log preserved for parity with React portal debug logs
    // ══════════════════════════════════════════════════════════════

    loadUccData() {
        if (this._uccLoaded || this._uccLoading) return;
        this._uccLoading = true;
        this._uccError   = null;

        console.log('[CDR-UCC] loadUccData → companyId:', this.companyId);

        getUccFilings({ companyId: this.companyId })
            .then(json => {
                if (!json) {
                    this._uccViewModel = buildUccViewModel({
                        uccFilings:  [],
                        totalFilings: 0,
                        companyName:  null,
                    });
                    return;
                }

                let raw;
                try {
                    raw = JSON.parse(json);
                } catch (e) {
                    this._uccError = 'UCC data could not be parsed.';
                    return;
                }

                // Handle array-wrapped response (some API versions wrap in [])
                if (Array.isArray(raw)) raw = raw[0] ?? null;

                if (!raw) {
                    this._uccViewModel = buildUccViewModel({
                        uccFilings:  [],
                        totalFilings: 0,
                        companyName:  null,
                    });
                    return;
                }

                console.log(
                    '[CDR-UCC] totalFilings:', raw.totalFilings,
                    '| filings count:',        raw.uccFilings?.length,
                    '| business.name:',        raw.business?.name || raw.companyName || '(none)'
                );

                this._uccViewModel = buildUccViewModel(raw);
            })
            .catch(err => {
                this._uccError = `Failed to load UCC data: ${err?.body?.message || err?.message || 'Unknown error'}`;
            })
            .finally(() => {
                this._uccLoading = false;
                this._uccLoaded  = true;
            });
    }


    // ─── Data Loading: VerticalIQ (UNCHANGED) ────────────────────────────────

    loadViqData(naicsCode) {
        if (this.viqLoading) return;
        this.viqLoading = true;
        this.viqError   = null;
        const code = (naicsCode !== undefined && naicsCode !== null)
            ? String(naicsCode).trim()
            : (this.viqNaicsCode ? this.viqNaicsCode.trim() : null);

        const params = { companyId: this.companyId };
        if (code) params.naicsCode = code;

        getVerticalIqData(params)
            .then(json => {
                if (!json) { this.viqViewModel = null; this.viqError = 'No VerticalIQ data found. Try entering a NAICS code and reloading.'; return; }
                let raw;
                try { raw = JSON.parse(json); } catch (e) { this.viqError = 'VerticalIQ data could not be parsed.'; return; }
                if (Array.isArray(raw)) raw = raw[0] ?? null;
                if (!raw) { this.viqError = 'VerticalIQ returned an empty response.'; return; }
                if (raw.naicsCode && !this.viqNaicsCode) this.viqNaicsCode = String(raw.naicsCode);
                this.viqViewModel = buildViqViewModel(raw);
            })
            .catch(err => { this.viqError = `Failed to load VerticalIQ data: ${err?.body?.message || err?.message || 'Unknown error'}`; })
            .finally(() => { this.viqLoading = false; this.viqLoaded = true; });
    }

handleSectionClick(event) {
    this.activeSection = event.currentTarget.dataset.section;

    // Lazy-load leadership only when that tab is first opened
    if (this.activeSection === 'leadership' && !this.leadershipLoaded) {
        this.loadLeadership();
    }
}

    loadLeadership() {
    if (!this.companyId) return;
    this._leadershipLoading = true;
    this._leadershipError   = null;

    getAiNavigatorReport({ companyId: this.companyId })
        .then(json => {
            const report = JSON.parse(json);
            console.log('LEADERSHIP DEBUG:', JSON.stringify(Object.keys(report)));
            console.log('LEADERSHIP NODE:', JSON.stringify(report?.leadership));
            const leaders = report?.leadership?.leaders;

            if (!leaders || leaders.length === 0) {
                throw new Error('No leadership data found in report.');
            }

            this._leadershipData      = { executives: leaders };
            this._leadershipViewModel = buildLeadershipViewModel(this._leadershipData);
            this._leadershipLoaded    = true;
            this._leadershipLoading   = false;
        })
        .catch(err => {
            this._leadershipError   = err?.body?.message || err?.message || 'Failed to load leadership data.';
            this._leadershipLoading = false;
        });
}

    // ─── Helpers (UNCHANGED) ──────────────────────────────────────────────────

    buildSourcesFromArray(raw) {
        this.sources = raw.map((s, idx) => ({
            idx:   idx + 1,
            url:   typeof s === 'string' ? s : (s.url || s.href || ''),
            label: typeof s === 'string' ? s : (s.label || s.title || s.url || ''),
        }));
    }

    parseReportIntoSections(text) {
        if (!text) return [];
        const normalised = text.replace(/\r\n/g, '\n');
        const lines      = normalised.split('\n');
        const sections   = [];
        const seenIds    = new Set();
        const SKIP_HEADINGS = [
            'institutional-grade banking intelligence report',
            'structured metadata',
            'prepared',
            'classification',
        ];

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            const match = trimmed.match(/^(#{1,2})(?!#)\s?(.+)/);
            if (!match) return;
            if (match[1].length === 1) return;

            const rawTitle = stripInlineMd(match[2]).replace(/^#+\s*/, '');

            // ✅ Substring match for boilerplate headings
            const rawLower = rawTitle.toLowerCase();
            const isBoilerplate = SKIP_HEADINGS.some(kw => rawLower.includes(kw));

            // ✅ Skip bare company-name H2 that appears before section "1."
            const isPreNumberedCompanyName = sections.length === 0 && !/^\d/.test(rawTitle);

            if (isBoilerplate || isPreNumberedCompanyName) return;

            // ✅ Fixed title casing
            const displayTitle = resolveTitle(rawTitle)
                .replace(/\b\w+/g, (w, offset) => {
                    const lower = w.toLowerCase();
                    return (offset === 0 || w.length > 3)
                        ? lower[0].toUpperCase() + lower.slice(1)
                        : lower;
                });

            const id = headingToId(rawTitle);
            if (seenIds.has(id)) return;
            seenIds.add(id);

            const isFirst = sections.length === 0;
            sections.push({
                id,
                title: displayTitle,
                startIndex: index,
                content: '',
                renderedRows: [],
                isExpanded: isFirst,
                chevron: isFirst ? 'chevron-down' : 'chevron-right',
                ariaExpanded: isFirst ? 'true' : 'false'
            });
        });

        if (sections.length === 0) {
            const content = normalised.trim();
            return [{
                id: 'full-report',
                title: 'Full Report',
                startIndex: 0,
                content,
                renderedRows: parseContentToRows(content),
                isExpanded: true,
                chevron: 'chevron-down',
                ariaExpanded: 'true'
            }];
        }

        for (let i = 0; i < sections.length; i++) {
            const start   = sections[i].startIndex + 1;
            const end     = i < sections.length - 1 ? sections[i + 1].startIndex : lines.length;
            const content = lines.slice(start, end).join('\n').trim();
            sections[i].content      = content;
            sections[i].renderedRows = parseContentToRows(content);
        }
        return sections;
    }
// ─── Getters: Sub-tab navigation ──────────────────────────────────────────

get researchSubTabs() {
    return RESEARCH_SUBTABS.map(tab => ({
        ...tab,
        cssClass: `cdr-subtab-btn${this.activeResearchSection === tab.id ? ' cdr-subtab-btn--active' : ''}`,
    }));
}

// ... rest of your tab getters
    get isResearchLibraryTab() { return this.activeResearchSection === 'researchLibrary'; }
    get isLeadershipTab()      { return this.activeResearchSection === 'leadership';      }
    get isUccTab()             { return this.activeResearchSection === 'ucc';             }
    get isViqTab()             { return this.activeResearchSection === 'viq';             }
    get isRmaTab()             { return this.activeResearchSection === 'rma';             }
    get isEquifaxTab()         { return this.activeResearchSection === 'equifax';         }


    // ══════════════════════════════════════════════════════════════
    // GETTERS: UCC TAB  ← REWRITTEN / EXPANDED
    //
    // New getters added to match React portal template bindings:
    //   uccFilingsLabel     → "N filing(s)" badge string
    //   uccShowEmptyState   → show the "–" empty card
    //   uccShowFilings      → show the filing card list
    //   uccNotYetLoaded     → pre-tab state (no spinner, no content)
    //
    // All original getters retained unchanged.
    // ══════════════════════════════════════════════════════════════

    /** True while the Apex callout is in-flight — drives spinner */
    get uccIsLoading()       { return this._uccLoading; }

    /** True when an error string is present — drives error banner */
    get uccHasError()        { return !!this._uccError; }

    /** Raw error string for the error block */
    get uccError()           { return this._uccError; }

    /** True when at least one filing exists in the view model */
    get uccHasFilings()      { return this._uccViewModel?.hasFilings === true; }

    /** Array of shaped filing objects for lwc:for iteration */
    get uccFilings()         { return this._uccViewModel?.filings || []; }

    /** Numeric total — may exceed stored array length (API-reported) */
    get uccTotalFilings()    { return this._uccViewModel?.totalFilings || 0; }

    /** Verified business name from Middesk — null when absent */
    get uccBusinessName()    { return this._uccViewModel?.businessName || null; }

    /** True when a verified name is present — drives the name tile */
    get uccHasBusinessName() { return !!this._uccViewModel?.businessName; }

    /**
     * Badge label: "1 filing" / "10 filings"
     * Matches React portal: `${n} filing${n !== 1 ? 's' : ''}`
     */
    get uccFilingsLabel() {
        const n = this.uccTotalFilings;
        return `${n} filing${n !== 1 ? 's' : ''}`;
    }

    /**
     * Show empty-state card:
     *   load complete AND no error AND zero filings
     * Matches React portal's conditional: !middeskData?.uccFilings || length === 0
     */
    get uccShowEmptyState() {
        return this._uccLoaded &&
               !this._uccLoading &&
               !this._uccError   &&
               !this.uccHasFilings;
    }

    /**
     * Show filing card list:
     *   load complete AND no error AND at least one filing
     */
    get uccShowFilings() {
        return this._uccLoaded &&
               !this._uccLoading &&
               !this._uccError   &&
               this.uccHasFilings;
    }

    /**
     * True before the UCC tab has ever been visited.
     * Prevents rendering any UCC state until the lazy load fires.
     */
    get uccNotYetLoaded() { return !this._uccLoaded && !this._uccLoading; }


    // ─── Getters: VIQ tab (UNCHANGED) ────────────────────────────────────────

    get viqIsLoading()            { return this.viqLoading; }
    get viqHasError()             { return !!this.viqError; }
    get viqHasApiError()          { return !!this.viqViewModel?.hasApiError; }
    get viqApiErrorMsg()          { return this.viqViewModel?.apiError; }
    get viqNotYetLoaded()         { return !this.viqLoaded && !this.viqLoading; }
    get viqShowEmptyState()       { return this.viqLoaded && !this.viqLoading && !this.viqError && !this.viqViewModel; }
    get viqShowData()             { return this.viqLoaded && !this.viqLoading && !this.viqError && !!this.viqViewModel && !this.viqViewModel.hasApiError; }
    get viqIndustryName()         { return this.viqViewModel?.industryName || 'Unknown Industry'; }
    get viqNaicsDisplay()         { return this.viqViewModel?.naicsCode || 'N/A'; }
    get viqIndustryId()           { return this.viqViewModel?.industryId || 'N/A'; }
    get viqHasInsights()          { return !!this.viqViewModel?.hasInsights; }
    get viqInsightsContent()      { return this.viqViewModel?.insightsContent; }
    get viqInsightsGenerated()    { return this.viqViewModel?.insightsGenerated; }
    get viqHasInsightsGenerated() { return !!this.viqViewModel?.insightsGenerated; }
    get viqTrendsExpanded()               { return !this.viqSectionsCollapsed.industryTrends;      }
    get viqConditionsExpanded()           { return !this.viqSectionsCollapsed.currentConditions;   }
    get viqQuarterlyExpanded()            { return !this.viqSectionsCollapsed.quarterlyInsights;   }
    get viqBankingExpanded()              { return !this.viqSectionsCollapsed.bankingProducts;     }
    get viqQuestionsExpanded()            { return !this.viqSectionsCollapsed.keyQuestions;        }
    get viqGlobalTrendsExpanded()         { return !this.viqSectionsCollapsed.globalTrends;        }
    get viqIndustryOverviewExpanded()     { return !this.viqSectionsCollapsed.industryOverview;    }
    get viqIndustryTermsExpanded()        { return !this.viqSectionsCollapsed.industryTerms;       }
    get viqFinancialBenchmarksExpanded()  { return !this.viqSectionsCollapsed.financialBenchmarks; }
    get viqFinancialMetricsExpanded()     { return !this.viqSectionsCollapsed.financialMetrics;    }
    get viqOperationsExpanded()           { return !this.viqSectionsCollapsed.operations;          }
    get viqTrendsChevron()                { return this.viqTrendsExpanded             ? '▾' : '▸'; }
    get viqConditionsChevron()            { return this.viqConditionsExpanded         ? '▾' : '▸'; }
    get viqQuarterlyChevron()             { return this.viqQuarterlyExpanded          ? '▾' : '▸'; }
    get viqBankingChevron()               { return this.viqBankingExpanded            ? '▾' : '▸'; }
    get viqQuestionsChevron()             { return this.viqQuestionsExpanded          ? '▾' : '▸'; }
    get viqGlobalTrendsChevron()          { return this.viqGlobalTrendsExpanded       ? '▾' : '▸'; }
    get viqIndustryOverviewChevron()      { return this.viqIndustryOverviewExpanded   ? '▾' : '▸'; }
    get viqIndustryTermsChevron()         { return this.viqIndustryTermsExpanded      ? '▾' : '▸'; }
    get viqFinancialBenchmarksChevron()   { return this.viqFinancialBenchmarksExpanded ? '▾' : '▸'; }
    get viqFinancialMetricsChevron()      { return this.viqFinancialMetricsExpanded   ? '▾' : '▸'; }
    get viqOperationsChevron()            { return this.viqOperationsExpanded         ? '▾' : '▸'; }
    get viqShowIndustryTrends()      { return !!this.viqViewModel?.showIndustryTrends;     }
    get viqShowCurrentConditions()   { return !!this.viqViewModel?.showCurrentConditions;  }
    get viqShowQuarterlyInsights()   { return !!this.viqViewModel?.showQuarterlyInsights;  }
    get viqShowBankingProducts()     { return !!this.viqViewModel?.showBankingProducts;    }
    get viqShowKeyQuestions()        { return !!this.viqViewModel?.showKeyQuestions;       }
    get viqShowGlobalTrends()        { return !!this.viqViewModel?.showGlobalTrends;       }
    get viqShowIndustryOverview()    { return !!(this.viqViewModel?.hasForecast || this.viqViewModel?.hasStructure || this.viqViewModel?.hasDerivedStatements); }
    get viqShowIndustryTerms()       { return !!this.viqViewModel?.hasTerms;               }
    get viqShowFinancialBenchmarks() { return !!this.viqViewModel?.hasBenchmarks;          }
    get viqShowFinancialMetrics()    { return !!this.viqViewModel?.hasFinancialMetrics;     }
    get viqShowOperations()          { return !!this.viqViewModel?.hasOperations;           }
    get viqTrends()                  { return this.viqViewModel?.trends;              }
    get viqCurrentConditions()       { return this.viqViewModel?.currentConditions;   }
    get viqQuarterlyInsights()       { return this.viqViewModel?.quarterlyInsights;   }
    get viqBankingProducts()         { return this.viqViewModel?.bankingProducts;     }
    get viqKeyQuestions()            { return this.viqViewModel?.keyQuestions;        }
    get viqGlobalTrends()            { return this.viqViewModel?.globalTrends;        }
    get viqDerivedStatements()       { return this.viqViewModel?.derivedStatements;   }
    get viqTerms()                   { return this.viqViewModel?.terms;               }
    get viqBenchmarks()              { return this.viqViewModel?.benchmarks;          }
    get viqFinancialMetrics()        { return this.viqViewModel?.financialMetrics || null; }
    get viqForecasts()               { return this.viqViewModel?.forecasts || null;   }
    get viqStructure()               { return this.viqViewModel?.structure || null;   }
    get viqProfitDrivers()           { return this.viqViewModel?.profitDrivers;       }
    get viqRevenuePerEmployee()      { return this.viqViewModel?.revenuePerEmployee;  }
    get viqWorkingCapitalBullets()   { return this.viqViewModel?.workingCapitalBullets; }
    get viqCashMgmtChallenges()      { return this.viqViewModel?.cashMgmtChallenges;  }
    get viqTrendsCount()             { return this.viqViewModel?.trendsCount            || 0; }
    get viqCurrentConditionsCount()  { return this.viqViewModel?.currentConditionsCount || 0; }
    get viqQuarterlyInsightsCount()  { return this.viqViewModel?.quarterlyInsightsCount || 0; }
    get viqBankingProductsCount()    { return this.viqViewModel?.bankingProductsCount   || 0; }
    get viqKeyQuestionsCount()       { return this.viqViewModel?.keyQuestionsCount      || 0; }
    get viqGlobalTrendsCount()       { return this.viqViewModel?.globalTrendsCount      || 0; }
    get viqTermsCount()              { return this.viqViewModel?.termsCount             || 0; }
    get viqReloadDisabled()          { return !this.viqNaicsCode || !this.viqNaicsCode.trim() || this.viqLoading; }
    get viqHasForecast()             { return !!this.viqViewModel?.hasForecast;          }
    get viqHasStructure()            { return !!this.viqViewModel?.hasStructure;         }
    get viqHasDerivedStatements()    { return !!this.viqViewModel?.hasDerivedStatements; }
    get viqHasTerms()                { return !!this.viqViewModel?.hasTerms;             }
    get viqHasBenchmarks()           { return !!this.viqViewModel?.hasBenchmarks;        }
    get viqHasFinancialMetrics()     { return !!this.viqViewModel?.hasFinancialMetrics;  }
    get viqHasOperations()           { return !!this.viqViewModel?.hasOperations;        }
    get viqHasProfitDrivers()        { return !!this.viqViewModel?.hasProfitDrivers;     }
    get viqHasRevenuePerEmployee()   { return !!this.viqViewModel?.hasRevenuePerEmployee; }
    get viqHasWorkingCapitalBullets(){ return !!this.viqViewModel?.hasWorkingCapitalBullets; }
    get viqHasCashMgmtChallenges()   { return !!this.viqViewModel?.hasCashMgmtChallenges; }
    get viqForecastGrowthRate()      { return this.viqViewModel?.forecasts?.growthrateoverall; }
    get viqForecastRelative()        { return this.viqViewModel?.forecasts?.relativestring;    }


    // ─── Getters: Report / other tabs (UNCHANGED) ────────────────────────────

    get hasSections() { return this.parsedSections && this.parsedSections.length > 0; }
    get hasSources()  { return this.sources && this.sources.length > 0; }
    get allExpanded() { return this.parsedSections && this.parsedSections.length > 0 && this.parsedSections.every(s => s.isExpanded); }

    findSection(keyword) {
        return this.parsedSections?.find(s => s.title.toLowerCase().includes(keyword.toLowerCase()));
    }

    get hasViqData()     { return this.viqLoaded && !!this.viqViewModel; }
    get rmaContent()     { return this.findSection('financial')?.content; }
    get hasRmaData()     { return !!this.rmaContent; }
    get hasEquifaxData() { return false; }
    // ─── Getters: Leadership Tab ──────────────────────────────────────────────

    get leadershipIsLoading()    { return this._leadershipLoading; }  
    get leadershipHasError()   { return !!this._leadershipError; }
    get leadershipError()      { return this._leadershipError; }
    get leadershipNotYetLoaded() { return !this._leadershipLoaded && !this._leadershipLoading; }
get leadershipExecutives() {
    if (!this._leadershipData?.executives) return [];
    return this._leadershipData.executives.map((l, index) => {
        const name = l.fullName || l.name || '';

        // Confidence badge
        const sourceMap = {
            rocketreach: { label: 'Verified',   cls: 'ldr-badge ldr-badge--high' },
            perplexity:  { label: 'Unverified',  cls: 'ldr-badge ldr-badge--low'  },
        };
        const conf = sourceMap[l.source] || { label: 'Unverified', cls: 'ldr-badge ldr-badge--low' };

        const rawTitle = l.designation || l.title || '';
        const designation = rawTitle.length > 60 ? rawTitle.substring(0, 57) + '...' : rawTitle;

        // ── Emails: full array for iteration ──
        const emails = (l.emails || []).map(e => ({
            email: e.email,
            type:  e.email_type || e.type || 'professional',
            grade: e.grade || '',
        }));
        const recommendedEmail = emails.find(e => e.grade === 'A' || e.grade === 'A-') || emails[0] || null;

        // ── Phones: full array for iteration ──
        const phones = (l.phones || []).map(p => ({
            number:      p.number || p.phone || '',
            type:        p.type || '',
            recommended: !!p.recommended,
        }));

        // ── Job history: full array for iteration ──
        const jobHistory = (l.jobHistory || []).map((j, jIdx) => ({
            key:       `jh-${index}-${jIdx}`,
            title:     j.title || '',
            company:   j.company || '',
            startDate: j.startDate || '',
            endDate:   j.isCurrent ? 'Present' : (j.endDate || ''),
            isCurrent: !!j.isCurrent,
            rowClass:  j.isCurrent ? 'ldr-job-row ldr-job-row--current' : 'ldr-job-row',
        }));

        // ── Education: full array for iteration ──
        const education = (l.education || []).map((e, eIdx) => ({
            key:    `edu-${index}-${eIdx}`,
            school: e.school || '',
            degree: e.degree || '',
            major:  e.major  || '',
        }));

        // ── Skills: full array for iteration ──
        const skills = (l.skills || []).filter(Boolean);

        // Social
        const linkedInUrl = l.linkedInUrl || l.links?.linkedin || null;
        const twitterUrl  = l.twitterUrl  || l.links?.twitter  || null;

        return {
            id:               String(l.rocketReachId || name || index),
            fullName:         name,
            designation:      designation,
            initials:         this.getInitials(name),
            location:         l.location || [l.city, l.state, l.country].filter(Boolean).join(', ') || '',
            profilePicUrl:    l.profilePicUrl || null,
            hasProfilePic:    !!l.profilePicUrl,
            confidenceLabel:  conf.label,
            confidenceClass:  conf.cls,

            // Emails
            emails,
            recommendedEmail,
            hasEmails:        emails.length > 0,
            emailCount:       emails.length,

            // Phones
            phones,
            hasPhones:        phones.length > 0,
            phoneCount:       phones.length,

            // Job history
            jobHistory,
            hasJobHistory:    jobHistory.length > 0,
            jobHistoryCount:  jobHistory.length,

            // Education
            education,
            hasEducation:     education.length > 0,
            educationCount:   education.length,

            // Skills
            skills,
            hasSkills:        skills.length > 0,
            skillCount:       skills.length,

            // Social
            linkedInUrl,
            hasLinkedIn:      !!linkedInUrl,
            twitterUrl,
            hasTwitter:       !!twitterUrl,
        };
    });
}
   
get leadershipHasError() {
    return !!this._leadershipError;
}

get leadershipCountLabel() {
    const count = this._leadershipData?.executives?.length || 0;
    return `${count} executive${count !== 1 ? 's' : ''}`;
}
   get leadershipTotalCount() { return this._leadershipData?.executives?.length || 0; }

   get leadershipHasExecutives() {
    return this._leadershipViewModel?.executives?.length > 0;
}

get leadershipShowEmptyState() {
    return this._leadershipLoaded &&
          !this._leadershipLoading &&
          !this._leadershipError &&
          !(this._leadershipViewModel?.executives?.length > 0);
}

    // Keep hasLeadership as alias for backward-compat with any existing HTML refs
    get hasLeadership() { return this.leadershipHasExecutives; }
    getInitials(name) {
        if (!name) return '??';
        return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
    }
    // ─── Event Handlers: Navigation (UNCHANGED) ──────────────────────────────

    handleSubTabChange(event) {
        const newTab = event.currentTarget.dataset.id;
        this.activeResearchSection = newTab;
        if (newTab === 'ucc' && !this._uccLoaded && !this._uccLoading) {
            this.loadUccData();
        } else if (newTab === 'viq' && !this.viqLoaded) {
            this.loadViqData();
        } else if (newTab === 'leadership' && !this._leadershipLoaded && !this._leadershipLoading) {
            this.loadLeadership();
        }
    }


    // ─── Event Handlers: Report accordion (UNCHANGED) ────────────────────────

    handleToggle(event) {
        const id = event.currentTarget.dataset.id;
        this.parsedSections = this.parsedSections.map(s =>
            s.id === id ? setExpanded(s, !s.isExpanded) : s
        );
    }

    handleExpandAll()   { this.parsedSections = this.parsedSections.map(s => setExpanded(s, true));  }
    handleCollapseAll() { this.parsedSections = this.parsedSections.map(s => setExpanded(s, false)); }


    // ══════════════════════════════════════════════════════════════
    // EVENT HANDLERS: UCC TAB  ← REWRITTEN
    //
    // handleUccRefresh: clears all UCC state and re-fires loadUccData.
    // This mirrors the React portal's refetchMiddesk() pattern where
    // staleTime:0 / gcTime:0 forces a fresh fetch on every call.
    // ══════════════════════════════════════════════════════════════

    handleUccRefresh() {
        this._uccViewModel = null;
        this._uccLoaded    = false;
        this._uccError     = null;
        this.loadUccData();
    }
    // ─── Event Handlers: VIQ tab (UNCHANGED) ─────────────────────────────────

    handleViqNaicsChange(event)  { this.viqNaicsCode = event.target.value; }
    handleViqNaicsKeydown(event) { if (event.key === 'Enter' && this.viqNaicsCode?.trim()) this.handleViqReload(); }

    handleViqReload() {
        if (!this.viqNaicsCode?.trim()) return;
        this.viqViewModel = null;
        this.viqLoaded    = false;
        this.viqError     = null;
        this.loadViqData(this.viqNaicsCode.trim());
    }

    handleViqSectionToggle(event) {
        const section = event.currentTarget.dataset.section;
        if (!section || !(section in this.viqSectionsCollapsed)) return;
        this.viqSectionsCollapsed = { ...this.viqSectionsCollapsed, [section]: !this.viqSectionsCollapsed[section] };
    }

    handleViqExpandAll() {
        this.viqSectionsCollapsed = Object.fromEntries(Object.keys(this.viqSectionsCollapsed).map(k => [k, false]));
    }

    handleViqCollapseAll() {
        this.viqSectionsCollapsed = Object.fromEntries(Object.keys(this.viqSectionsCollapsed).map(k => [k, true]));
    }

    handleViqRefresh() {
        this.viqViewModel         = null;
        this.viqLoaded            = false;
        this.viqError             = null;
        this.viqSectionsCollapsed = { ...VIQ_SECTIONS_DEFAULT_COLLAPSED };
        this.loadViqData(this.viqNaicsCode?.trim() || null);
    }
}

import { LightningElement, api, track } from 'lwc';
import getContactAndCompanyRecord from '@salesforce/apex/ContactAiNavigatorController.getContactAndCompanyRecord';
import getAiNavigatorReport from '@salesforce/apex/CompanyDetailController.getAiNavigatorReport';

// Clean brackets, numbers, and tildes [1]
function cleanDisplayData(str) {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/\[\d+\]/g, '') // Removes bracketed citations e.g. [1]
        .replace(/~/g, '')       // Removes tildes (~)
        .replace(/\s+/g, ' ')    // Condenses whitespaces
        .trim();
}

function formatDate(d) {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return d; }
}

export default class ContactAiNavigator extends LightningElement {
    @api recordId; // Contact Record ID automatically injected [1]

    @track isLoading = true;
    @track error = null;

    @track companyRecord = null;
    @track contactEmail = '';
    @track contactFirstName = '';
    @track contactLastName = '';

    @track leadershipExecutives = [];

    connectedCallback() {
        this.fetchData();
    }

    async fetchData() {
        this.isLoading = true;
        this.error = null;
        this.companyRecord = null;
        this.contactEmail = '';
        this.contactFirstName = '';
        this.contactLastName = '';
        this.leadershipExecutives = [];

        try {
            // 1. Fetch Contact Details and related Company__c record in one transaction [1]
            const wrapper = await getContactAndCompanyRecord({ contactId: this.recordId });
            
            if (wrapper) {
                this.contactEmail = wrapper.contactEmail;
                this.contactFirstName = wrapper.contactFirstName;
                this.contactLastName = wrapper.contactLastName;
                this.companyRecord = wrapper.company;

                // 2. If Company is active and completed, pull leadership report
                if (wrapper.company && wrapper.company.Status__c && wrapper.company.Status__c.toLowerCase() === 'completed') {
                    const reportResponse = await getAiNavigatorReport({ companyId: wrapper.company.Id });
                    
                    if (reportResponse) {
                        const parsedReport = JSON.parse(reportResponse);
                        const leaders = parsedReport?.leadership?.leaders ?? parsedReport?.leaders ?? [];
                        this.buildLeadershipViewModel(leaders);
                    }
                }
            }
        } catch (err) {
            this.error = err?.body?.message || err?.message || 'Failed to retrieve Contact Context.';
        } finally {
            this.isLoading = false;
        }
    }

    handleRefresh() {
        this.fetchData();
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

    /**
     * Dual matching logic [1]:
     * 1. Direct, case-insensitive Email Address match.
     * 2. Fallback to First Name + Last Name matching.
     */
    get matchedExecutive() {
        if (!this.contactEmail && (!this.contactFirstName || !this.contactLastName)) {
            return null;
        }
        if (this.leadershipExecutives.length === 0) {
            return null;
        }

        // 1. Direct Email Address Match (case-insensitive) [1]
        if (this.contactEmail) {
            const emailToMatch = this.contactEmail.toLowerCase().trim();
            const emailMatch = this.leadershipExecutives.find(exec => 
                exec.emails.some(em => em.email.toLowerCase().trim() === emailToMatch)
            );
            if (emailMatch) return emailMatch;
        }

        // 2. Restored Name-Matching Fallback [1]
        if (this.contactFirstName && this.contactLastName) {
            const first = this.contactFirstName.toLowerCase().trim();
            const last = this.contactLastName.toLowerCase().trim();
            const nameMatch = this.leadershipExecutives.find(exec => {
                const lowerName = exec.fullName.toLowerCase();
                return lowerName.includes(first) && lowerName.includes(last);
            });
            if (nameMatch) return nameMatch;
        }

        return null;
    }
}
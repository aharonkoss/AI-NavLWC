import { LightningElement, api, track } from 'lwc';

const SECTIONS = [
    { id: 'companyleadership', name: 'Company & Leadership' },
    { id: 'industrymarket',    name: 'Industry & Market'   },
    { id: 'financiallegal',    name: 'Financial & Legal'   },
    { id: 'regulatory',        name: 'Regulatory'          }
];

const IMPACT_CLASSES = {
    High:   'cdu-impact cdu-impact-high',
    Medium: 'cdu-impact cdu-impact-medium',
    Low:    'cdu-impact cdu-impact-low'
};

export default class CompanyDetailUpdates extends LightningElement {
    @api liveUpdates = [];
    @api company = {};
    @track activeSection = 'companyleadership';
    @track isLoading = false;
    @api companyName;   
    @track isDownloading = false;

    get pdfGenerator() {
        return this.template.querySelector('c-pdf-generator');
    }

   @api handleDownloadPDF() {
        try {
            this.isDownloading = true;
            const generator = this.template.querySelector('c-pdf-generator');
            console.log('🔔 Updates: generator found:', !!generator);
            if (generator) {
                const resolvedName = this.company?.name || this.company?.Name || 'Unknown Company';
                const allUpdates = (this.liveUpdates || []).flatMap(
                    section => section?.content?.updates || []
                );
                console.log('📤 companyName:', resolvedName);
                console.log('📤 Passing to PDF:', allUpdates.length, 'updates');
                generator.generatePDF('liveUpdates', resolvedName, allUpdates);
            } else {
                console.error('❌ c-pdf-generator not found in template');
            }
            setTimeout(() => { this.isDownloading = false; }, 3000);
        } catch(e) {
            console.error('❌ handleDownloadPDF error:', e.message, e.stack);
        }
    }

    get sections() {
        return SECTIONS.map(s => ({
            ...s,
            cls: s.id === this.activeSection
                ? 'cdu-subtab cdu-subtab-active'
                : 'cdu-subtab'
        }));
    }

    get currentUpdates() {
        const section = this.liveUpdates.find(s => s.sectionType === this.activeSection);
        const updates = section?.content?.updates || [];
        return updates.map(u => ({
            ...u,
            impactClass: IMPACT_CLASSES[u.impact] || IMPACT_CLASSES['Low']
        }));
    }

    get hasUpdates() {
        return this.currentUpdates.length > 0;
    }

    handleSectionClick(event) {
        this.activeSection = event.currentTarget.dataset.section;
    }
}
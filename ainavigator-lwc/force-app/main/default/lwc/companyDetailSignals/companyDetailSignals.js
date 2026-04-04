import { LightningElement, api, track } from 'lwc';

const PRIORITY_CLASSES = {
    P5: 'cds-priority cds-p5',
    P4: 'cds-priority cds-p4',
    P3: 'cds-priority cds-p3',
    P2: 'cds-priority cds-p2',
    P1: 'cds-priority cds-p1'
};
const URGENCY_MAP = {
    P5: { label: 'Immediate',  cls: 'cds-urgency cds-urgency-immediate' },
    P4: { label: 'Immediate',  cls: 'cds-urgency cds-urgency-immediate' },
    P3: { label: '1–2 Weeks',  cls: 'cds-urgency cds-urgency-timely'    },
    P2: { label: 'Informational', cls: 'cds-urgency cds-urgency-low'    }
};

export default class CompanyDetailSignals extends LightningElement {
    @api signalsData = null;
    @api company = {};
    @track isDownloading = false;

    get signals() {
        const raw = this.signalsData?.signals || [];
        return raw.map(s => ({
            ...s,
            cardClass:    'cds-card',
            priorityClass: PRIORITY_CLASSES[s.priority] || 'cds-priority',
            categoryClass: 'cds-category',
            urgencyLabel: URGENCY_MAP[s.priority]?.label || 'Informational',
            urgencyClass: URGENCY_MAP[s.priority]?.cls   || 'cds-urgency cds-urgency-low'
        }));
    }
    @api handleDownloadPDF() {
        try {
            this.isDownloading = true;
            const generator = this.template.querySelector('c-pdf-generator');
            console.log('🔔 Updates: generator found:', !!generator);
            console.log('🔍 Signals data being passed:', JSON.stringify(this.signalsData)?.substring(0, 500));
            if (generator) {
                const name = this.company?.name || this.company?.Name || 'Unknown Company';
                // Unwrap signals array from the wrapper object
                const signalsArray = Array.isArray(this.signalsData) 
                    ? this.signalsData 
                    : (this.signalsData?.signals || []);
                console.log('🔍 Passing signals count:', signalsArray.length);
                generator.generatePDF('signals', name, signalsArray);
            } else {
                console.error('❌ c-pdf-generator not found in template');
            }
            setTimeout(() => { this.isDownloading = false; }, 3000);
        } catch(e) {
            console.error('❌ handleDownloadPDF error:', e.message, e.stack);
        }
    }
    get hasSignals() { return this.signals.length > 0; }
    get companyName() {
      return this.company?.name || 'Company';
   }
}
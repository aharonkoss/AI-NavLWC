import { LightningElement, api, track } from 'lwc';
import getAiResearch from '@salesforce/apex/CompanyDetailController.getAiResearch';

const SECTIONS = [
    { id: 'company',            name: 'Company Profile'        },
    { id: 'industry',           name: 'Industry Analysis'      },
    { id: 'targetcustomer',     name: 'Target Customer'        },
    { id: 'ecosystem',          name: 'Ecosystem & Partnerships'},
    { id: 'leadership',         name: 'Leadership'             },
    { id: 'strategicintelligence', name: 'Strategic Intel'     },
    { id: 'financial',          name: 'Financial'              }
];

const CONFIDENCE_CLASSES = {
    high:   'cdr-conf cdr-conf-high',
    medium: 'cdr-conf cdr-conf-medium',
    low:    'cdr-conf cdr-conf-low'
};

export default class CompanyDetailResearch extends LightningElement {
    @api companyId;
    @track activeSection = 'company';
    @track aiResearch = null;
    @track isLoading = true;

    connectedCallback() {
        this.loadResearch();
    }

    loadResearch() {
        this.isLoading = true;
        getAiResearch({ companyId: this.companyId })
            .then(json => {
                this.aiResearch = JSON.parse(json);
                this.isLoading = false;
            })
            .catch(err => {
                console.error('Research load error', err);
                this.isLoading = false;
            });
    }

    get sections() {
        return SECTIONS.map(s => ({
            ...s,
            cls: s.id === this.activeSection
                ? 'cdr-subtab cdr-subtab-active'
                : 'cdr-subtab'
        }));
    }

    handleSectionClick(event) {
        this.activeSection = event.currentTarget.dataset.section;
    }

    get showCompany()       { return this.activeSection === 'company'; }
    get showIndustry()      { return this.activeSection === 'industry'; }
    get showTargetCustomer(){ return this.activeSection === 'targetcustomer'; }
    get showEcosystem()     { return this.activeSection === 'ecosystem'; }
    get showLeadership()    { return this.activeSection === 'leadership'; }
    get showStrategic()     { return this.activeSection === 'strategicintelligence'; }
    get showFinancial()     { return this.activeSection === 'financial'; }

    get _r() { return this.aiResearch || {}; }

    get companyData()    { return this._r.company?.data        || {}; }
    get industryData()   { return this._r.industry?.data       || {}; }
    get targetCustomerData() { return this._r.targetcustomer?.data || {}; }
    get ecosystemData()  { return this._r.ecosystempartnerships?.data || {}; }
    get leadershipData() { return this._r.leadership?.data     || {}; }
    get strategicData()  { return this._r.strategicintelligence?.data || {}; }
    get financialData()  { return this._r.financial?.data      || {}; }

    get companyMetrics() {
        const d = this.companyData;
        return [
            { label: 'Annual Revenue', value: d.revenue    || '—' },
            { label: 'Employees',      value: d.employees  || '—' },
            { label: 'Founded',        value: d.founded    || '—' },
            { label: 'Headquarters',   value: d.headquarters || '—' }
        ];
    }

    get industryMetrics() {
        const d = this.industryData;
        return [
            { label: 'Industry',     value: d.industry   || '—' },
            { label: 'Market Size',  value: d.marketSize || '—' },
            { label: 'Growth Rate',  value: d.growthRate || '—' }
        ];
    }

    get leaders() {
        const raw = this.leadershipData.leaders || [];
        return raw.map(l => ({
            ...l,
            initials: this.getInitials(l.fullName || l.name || '')
        }));
    }

    getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    }

    get strategicFields() {
        return this.strategicData.fields || [];
    }

    get financialFields() {
        const fields = this.financialData.fields || [];
        return fields.map(f => ({
            ...f,
            confidenceClass: CONFIDENCE_CLASSES[f.confidence] || CONFIDENCE_CLASSES['low'],
            confidenceLabel: (f.confidence || 'low').toUpperCase()
        }));
    }

    get financialConfidenceClass() {
        return CONFIDENCE_CLASSES[this.financialData.verificationconfidence] || CONFIDENCE_CLASSES['low'];
    }

    get financialConfidenceLabel() {
        return (this.financialData.verificationconfidence || '').toUpperCase() + ' CONFIDENCE';
    }
}
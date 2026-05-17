import { LightningElement, api, track } from 'lwc';
import getInsights from '@salesforce/apex/CompanyDetailInsightsController.getInsights';

const CATEGORY_CLASSES = {
    'Actionable': 'cdi-badge cdi-badge-green',
    'Strategic':  'cdi-badge cdi-badge-purple',
    'Relational': 'cdi-badge cdi-badge-orange'
};
const PRIORITY_CLASSES = {
    'High':   'cdi-badge cdi-badge-red',
    'Medium': 'cdi-badge cdi-badge-yellow',
    'Low':    'cdi-badge cdi-badge-gray'
};
const SCORE_HIGH   = 'cdi-score cdi-score-high';
const SCORE_MEDIUM = 'cdi-score cdi-score-medium';
const SCORE_LOW    = 'cdi-score cdi-score-low';

function scoreClass(val) {
    if (val === 'High')   return SCORE_HIGH;
    if (val === 'Medium') return SCORE_MEDIUM;
    return SCORE_LOW;
}

export default class CompanyDetailInsights extends LightningElement {
    @api companyId;
    @track insightsData = null;
    @track isLoading = true;
    @track error = null;

    connectedCallback() {
        getInsights({ companyId: this.companyId })
            .then(json => {
                this.insightsData = JSON.parse(json);
                this.isLoading = false;
            })
            .catch(err => {
                console.error('Insights load error', err);
                this.error = err?.body?.message || 'Failed to load insights.';
                this.isLoading = false;
            });
    }

    get plan()           { return this.insightsData?.discoveryCallPlan; }
    get companyProfile() { return this.plan?.companyProfile; }
    get callStrategy()   { return this.plan?.callStrategy; }
    get rawInsights()    { return this.plan?.insights || []; }

    get insights() {
        return this.rawInsights.map(i => ({
            ...i,
            categoryClass:    CATEGORY_CLASSES[i.category]    || 'cdi-badge cdi-badge-gray',
            priorityClass:    PRIORITY_CLASSES[i.priority]    || 'cdi-badge cdi-badge-gray',
            recencyClass:     scoreClass(i.scoring?.recency),
            reliabilityClass: scoreClass(i.scoring?.reliability),
            recency:          i.scoring?.recency    || '',
            reliability:      i.scoring?.reliability || '',
            hasQuestions:     (i.discoveryQuestions?.length > 0)
        }));
    }

    get insightCount()    { return this.rawInsights.length; }
    get actionableCount() { return this.rawInsights.filter(i => i.category === 'Actionable').length; }
    get strategicCount()  { return this.rawInsights.filter(i => i.category === 'Strategic').length; }
    get relationalCount() { return this.rawInsights.filter(i => i.category === 'Relational').length; }
}
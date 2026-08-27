import { LightningElement, api, track, wire } from 'lwc';
import getEnhancedDigestData from '@salesforce/apex/SignalDigestController.getEnhancedDigestData';

export default class EnhancedSignalDigest extends LightningElement {
    @api companyId;
    @track digestData = {};
    @track isLoading = true;

    @wire(getEnhancedDigestData, { companyId: '$companyId' })
    wiredData({ error, data }) {
        if (data) {
            const parsed = JSON.parse(data);
            // Process data for UI
            this.digestData = {
                ...parsed,
                interpretations: parsed.interpretations.map(item => ({
                    ...item,
                    impactClass: item.impact === 'high' ? 'impact-high' : 'impact-med'
                }))
            };
            this.isLoading = false;
        } else if (error) {
            console.error('Error loading digest:', error);
            this.isLoading = false;
        }
    }

    get tradeoffMain() {
        return this.digestData.primaryTradeoff ? this.digestData.primaryTradeoff[0] : '';
    }

    get tradeoffList() {
        return this.digestData.primaryTradeoff ? this.digestData.primaryTradeoff.slice(1) : [];
    }
}
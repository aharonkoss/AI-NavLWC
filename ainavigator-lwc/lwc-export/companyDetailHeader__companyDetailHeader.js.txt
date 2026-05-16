import { LightningElement, api } from 'lwc';

export default class CompanyDetailHeader extends LightningElement {
    @api company;

    // Safe internal accessor — never null
    get _c() {
        return this.company || {};
    }

    get companyName()    { return this._c.name    || ''; }
    get companyCity()    { return this._c.city     || ''; }
    get companyState()   { return this._c.state    || ''; }
    get companyWebsite() { return this._c.website  || ''; }
    get companyStatus()  { return this._c.status   || ''; }
    get hasWebsite()     { return !!this._c.website; }

    get statusClass() {
        const s = this._c.status;
        if (s === 'completed')  return 'cdh-status cdh-status-completed';
        if (s === 'processing') return 'cdh-status cdh-status-processing';
        return 'cdh-status cdh-status-default';
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('backtodashboard', { bubbles: true, composed: true }));
    }
    handleDownloadPDF() {
            console.log('🔔 Header: handleDownloadPDF clicked, firing event');
            this.dispatchEvent(new CustomEvent('downloadpdf', { bubbles: true, composed: true }));
    }
    
}
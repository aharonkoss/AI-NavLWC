import { LightningElement, track } from 'lwc';
import submitCompany from '@salesforce/apex/InputController.submitCompany';

export default class InputForm extends LightningElement {
    @track companyName = '';
    @track website = '';
    @track city = '';
    @track state = '';
    @track stage = 'PreCall';
    @track clientType = 'Prospect';

    @track errors = {};
    @track urlValid = null;   // null = untouched, true = valid, false = invalid
    @track isSubmitting = false;
    @track submitSuccess = false;
    @track successMessage = '';

    stageOptions = [
        { label: 'PreCall',          value: 'PreCall' },
        { label: 'Appointment Set',  value: 'Appointment Set' },
        { label: 'Face To Face',     value: 'Face To Face' },
        { label: 'Qualification',    value: 'Qualification' }
    ];

    clientTypeOptions = [
        { label: 'Prospect',          value: 'Prospect' },
        { label: 'Existing Customer', value: 'Existing Customer' },
        { label: 'Past Customer',     value: 'Past Customer' }
    ];

    // ── Computed classes ───────────────────────────────────────────
    get companyNameInputClass() {
        return `input-field${this.errors.companyName ? ' input-error' : ''}`;
    }
    get websiteInputClass() {
        return `input-field${this.errors.website ? ' input-error' : this.urlValid === true ? ' input-valid' : ''}`;
    }
    get cityInputClass() {
        return `input-field${this.errors.city ? ' input-error' : ''}`;
    }
    get stateInputClass() {
        return `input-field${this.errors.state ? ' input-error' : ''}`;
    }
    get showUrlValid()   { return this.urlValid === true && this.website && this.website !== 'https://'; }
    get showUrlInvalid() { return this.urlValid === false && this.website && this.website !== 'https://'; }
    get showUrlError()   { return !!this.errors.website; }
    get showUrlHint()    { return !this.errors.website && this.urlValid === false && this.website !== 'https://'; }
    get submitBtnClass() { return `submit-btn${this.isSubmitting ? ' submit-btn-loading' : ''}`; }

    // ── URL Validation ──────────────────────────────────────────────
    validateUrl(url) {
        if (!url || url === 'https://') return false;
        try {
            const fullUrl = url.startsWith('http') ? url : `https://${url}`;
            const u = new URL(fullUrl);
            return (u.protocol === 'http:' || u.protocol === 'https:') &&
                   u.hostname.includes('.') && u.hostname.length > 3;
        } catch {
            return false;
        }
    }

    // ── Form Validation ─────────────────────────────────────────────
    validate() {
        const e = {};
        if (!this.companyName.trim()) e.companyName = 'Company name is required';
        if (!this.website.trim() || this.website === 'https://') {
            e.website = 'Website is required';
        } else if (!this.validateUrl(this.website)) {
            e.website = 'Please enter a valid URL (e.g., https://example.com)';
        }
        if (!this.city.trim()) e.city = 'City is required';
        if (!this.state.trim()) e.state = 'State is required';
        this.errors = e;
        return Object.keys(e).length === 0;
    }

    // ── Event Handlers ──────────────────────────────────────────────
    handleCompanyNameChange(event) {
        this.companyName = event.target.value;
        if (this.errors.companyName) this.errors = { ...this.errors, companyName: '' };
    }

    handleWebsiteFocus() {
        if (!this.website) this.website = 'https://';
    }

    handleWebsiteChange(event) {
        let value = event.target.value;
        if (!value.startsWith('https://') && !value.startsWith('http://')) {
            if (value.startsWith('https:/') || value.startsWith('https:')) {
                value = 'https://';
            } else if (value.startsWith('http:/') || value.startsWith('http:')) {
                value = 'http://';
            } else if (value) {
                value = 'https://' + value;
            }
        }
        this.website = value;
        if (value && value !== 'https://') {
            this.urlValid = this.validateUrl(value);
        } else {
            this.urlValid = null;
        }
        if (this.errors.website) this.errors = { ...this.errors, website: '' };
    }

    handleCityChange(event) {
        this.city = event.target.value;
        if (this.errors.city) this.errors = { ...this.errors, city: '' };
    }

    handleStateChange(event) {
        this.state = event.target.value;
        if (this.errors.state) this.errors = { ...this.errors, state: '' };
    }

    handleStageChange(event)      { this.stage = event.target.value; }
    handleClientTypeChange(event) { this.clientType = event.target.value; }

    handleSubmit(event) {
        event.preventDefault();
        if (!this.validate()) return;
        this.isSubmitting = true;
        submitCompany({
            companyName: this.companyName.trim(),
            website:     this.website.trim(),
            city:        this.city.trim(),
            state:       this.state.trim(),
            stage:       this.stage,
            clientType:  this.clientType
        })
        .then(() => {
            this.isSubmitting = false;
            this.submitSuccess = true;
            this.successMessage = `${this.companyName} submitted successfully! Once processed, you can view it from the Dashboard.`;
            this.companyName = '';
            this.website = '';
            this.city = '';
            this.state = '';
            this.stage = 'PreCall';
            this.clientType = 'Prospect';
            this.errors = {};
            this.urlValid = null;
            // Auto-clear success after 6 seconds
            setTimeout(() => { this.submitSuccess = false; }, 6000);
        })
        .catch(error => {
            this.isSubmitting = false;
            this.errors = { ...this.errors, submit: error.body?.message || 'Failed to submit. Please try again.' };
        });
    }

    handleDismissSuccess() {
        this.submitSuccess = false;
    }
}
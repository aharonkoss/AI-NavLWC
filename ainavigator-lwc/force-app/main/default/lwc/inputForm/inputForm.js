import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import submitCompany from '@salesforce/apex/InputController.submitCompany';
import submitBulkCompanies from '@salesforce/apex/InputController.submitBulkCompanies';

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

    // ── Duplicate tracking state ──────────────────────────────────
    @track duplicateMessage = '';
    @track duplicateWarnings = []; // For bulk upload duplicate messages: [{ name, message }]

    stageOptions = [
        { label: 'PreCall',           value: 'PreCall' },
        { label: 'Appointment Set',   value: 'Appointment Set' },
        { label: 'Face To Face',      value: 'Face To Face' },
        { label: 'Qualification',     value: 'Qualification' }
    ];

    clientTypeOptions = [
        { label: 'Prospect',          value: 'Prospect' },
        { label: 'Existing Customer', value: 'Existing Customer' },
        { label: 'Past Customer',     value: 'Past Customer' }
    ];

    _lastCreatedCompanyId     = null;
    _lastCreatedCorrelationId = null;

    // ── Computed classes & getters ────────────────────────────────
    get companyNameInputClass() {
        return `custom-input${this.errors.companyName ? ' input-error' : ''}`;
    }
    get websiteInputClass() {
        return `custom-input${this.errors.website ? ' input-error' : this.urlValid === true ? ' input-valid' : ''}`;
    }
    get cityInputClass() {
        return `custom-input${this.errors.city ? ' input-error' : ''}`;
    }
    get stateInputClass() {
        return `custom-input${this.errors.state ? ' input-error' : ''}`;
    }
    get showUrlValid()   { return this.urlValid === true && this.website && this.website !== 'https://'; }
    get showUrlInvalid() { return this.urlValid === false && this.website && this.website !== 'https://'; }
    get showUrlError()   { return !!this.errors.website; }
    get showUrlHint()    { return !this.errors.website && this.urlValid === false && this.website && this.website !== 'https://'; }
    get submitBtnClass() { return `submit-btn${this.isSubmitting ? ' submit-btn-loading' : ''}`; }

    get hasDuplicateMessage() {
        return !!this.duplicateMessage;
    }

    get hasDuplicateWarnings() {
        return this.duplicateWarnings && this.duplicateWarnings.length > 0;
    }

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
        this.clearDuplicateErrors();
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
        this.clearDuplicateErrors();
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

    clearDuplicateErrors() {
        this.duplicateMessage = '';
        if (this.errors.submit) {
            const { submit, ...rest } = this.errors;
            this.errors = rest;
        }
    }

    // ── 1. Manual Form Submission ────────────────────────────────────
    handleSubmit(event) {
        if (event) event.preventDefault();
        this.clearDuplicateErrors();

        if (!this.validate()) return;

        this.isSubmitting = true;

        submitCompany({
            companyName      : this.companyName.trim(),
            website          : this.website.trim(),
            city             : this.city.trim(),
            state            : this.state.trim(),
            stage            : this.stage,
            clientType       : this.clientType,
            isCalledFromLead : false
        })
        .then(resultJson => {
            const result = JSON.parse(resultJson);

            this._lastCreatedCompanyId     = result.companyId;
            this._lastCreatedCorrelationId = result.correlationId;

            this.isSubmitting  = false;
            this.submitSuccess = true;
            this.duplicateMessage = '';
            this.successMessage =
                `${result.name} has been submitted for research. ` +
                `You'll see it on the Dashboard while it processes.`;

            // Reset form fields
            this.companyName = '';
            this.website     = '';
            this.city        = '';
            this.state       = '';
            this.stage       = 'PreCall';
            this.clientType  = 'Prospect';
            this.errors      = {};
            this.urlValid    = null;

            this.dispatchEvent(new CustomEvent('companysubmitted', {
                bubbles : true,
                composed: true,
                detail  : {
                    companyId     : result.companyId,
                    correlationId : result.correlationId,
                    name          : result.name,
                    city          : result.city,
                    state         : result.state,
                    stage         : result.stage,
                    clientType    : result.clientType,
                    status        : 'processing',
                    createdAt     : result.createdAt
                }
            }));

            // Auto-clear success toast after 6 seconds
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.submitSuccess = false; }, 6000);
        })
        .catch(error => {
            this.isSubmitting = false;
            const message = error?.body?.message || error?.message || 'Failed to submit. Please try again.';
            
            // Set error states for display
            this.duplicateMessage = message;
            this.errors = {
                ...this.errors,
                submit: message
            };

            this.showToastNotification('Duplicate Company', message, 'error');
        });
    }

    // ── 2. Bulk Upload & 3. Prospect Discovery "Add to List" ────────
    @api
    async processBulkCompanies(companiesList, isCalledFromLead = false) {
        if (!companiesList || companiesList.length === 0) return;

        this.isSubmitting = true;
        this.duplicateWarnings = [];

        try {
            const response = await submitBulkCompanies({
                companiesData: companiesList,
                isCalledFromLead: isCalledFromLead
            });

            this.isSubmitting = false;

            // Handle duplicate warnings
            if (response.duplicates && response.duplicates.length > 0) {
                this.duplicateWarnings = response.duplicates.map(dup => ({
                    name: dup.companyName || dup.website,
                    message: dup.message
                }));

                // Show toast for each duplicate
                response.duplicates.forEach(dup => {
                    this.showToastNotification('Duplicate Skipped', dup.message, 'warning');
                });
            }

            // Handle successful insertions
            if (response.inserted && response.inserted.length > 0) {
                this.submitSuccess = true;
                this.successMessage = `Successfully submitted ${response.inserted.length} compan${response.inserted.length === 1 ? 'y' : 'ies'}.`;

                response.inserted.forEach(company => {
                    this.dispatchEvent(new CustomEvent('companysubmitted', {
                        bubbles : true,
                        composed: true,
                        detail  : company
                    }));
                });

                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => { this.submitSuccess = false; }, 6000);
            }

            return response;
        } catch (error) {
            this.isSubmitting = false;
            const errorMsg = error?.body?.message || 'Failed to process bulk upload.';
            this.errors = { ...this.errors, submit: errorMsg };
            this.showToastNotification('Submission Error', errorMsg, 'error');
            throw error;
        }
    }

    /**
     * @description Public API method for Add to List from Prospect Discovery
     */
    @api
    handleAddToList(selectedCompanies) {
        const formatted = Array.isArray(selectedCompanies) ? selectedCompanies : [selectedCompanies];
        return this.processBulkCompanies(formatted, false);
    }

    // ── Helper Toasts & Dismissals ────────────────────────────────────
    showToastNotification(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: variant === 'error' ? 'sticky' : 'dismissable'
        }));
    }

    handleDismissSuccess() {
        this.submitSuccess = false;
    }

    handleDismissDuplicate() {
        this.duplicateMessage = '';
    }

    handleDismissWarning(event) {
        const index = event.target.dataset.index;
        if (index !== undefined) {
            this.duplicateWarnings.splice(index, 1);
            this.duplicateWarnings = [...this.duplicateWarnings];
        }
    }
}
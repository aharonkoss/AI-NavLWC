import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import saveConfig from '@salesforce/apex/AI_Navigator_SetupController.saveConfig';
import getCurrentConfig from '@salesforce/apex/AI_Navigator_SetupController.getCurrentConfig';

export default class AiNavigatorConfig extends LightningElement {
    @track clientId = '';
    @track azureUrl = '';
    @track subscriptionKey = '';
    @track credentialName = '';
    @track timeout = 30000;
    @track environment = 'dev';
    @track schemaVersion = 'v1';
    @track retryAttempts = 3;
    @track isActive = true;
    @track isSaving = false;
    @track isLoading = true;

    connectedCallback() {
        this.loadConfigData();
    }

    loadConfigData() {
        this.isLoading = true;
        getCurrentConfig()
            .then(result => {
                if (result && result !== '{}') {
                    const config = JSON.parse(result);
                    this.clientId = config.clientId || '';
                    this.azureUrl = config.azureUrl || '';
                    this.subscriptionKey = config.subscriptionKey || '';
                    this.credentialName = config.credentialName || '';
                    this.timeout = config.timeout != null ? config.timeout : 30000;
                    this.environment = config.environment || 'dev';
                    this.schemaVersion = config.schemaVersion || 'v1';
                    this.retryAttempts = config.retryAttempts != null ? config.retryAttempts : 3;
                    this.isActive = config.isActive != null ? config.isActive : true;
                }
            })
            .catch(error => {
                this.showToast('Error', 'Failed to load existing configuration. ' + error.body.message, 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    handleFieldChange(event) {
        const fieldName = event.target.dataset.field;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        this[fieldName] = value;
    }

    handleSave() {
        // Run native HTML5 validations (verifies required attributes and URL patterns)
        const allValid = [
            ...this.template.querySelectorAll('lightning-input')
        ].reduce((validSoFar, inputCmp) => {
            inputCmp.reportValidity();
            return validSoFar && inputCmp.checkValidity();
        }, true);

        if (!allValid) {
            this.showToast('Validation Error', 'Please check your inputs and ensure your Azure URL format is correct.', 'error');
            return;
        }

        this.isSaving = true;

        const payload = {
            clientId: this.clientId,
            azureUrl: this.azureUrl,
            subscriptionKey: this.subscriptionKey,
            credentialName: this.credentialName,
            timeout: parseInt(this.timeout, 10),
            environment: this.environment,
            schemaVersion: this.schemaVersion,
            retryAttempts: parseInt(this.retryAttempts, 10),
            isActive: this.isActive
        };

        // FIXED: Using standard JS JSON.stringify() to serialize the parameters map
        saveConfig({ payloadJson: JSON.stringify(payload) })
            .then(() => {
                this.showToast('Success', 'Configuration save initiated successfully.', 'success');
            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            })
            .finally(() => {
                this.isSaving = false; // FIXED: Re-enables the Save button immediately once the transaction completes
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
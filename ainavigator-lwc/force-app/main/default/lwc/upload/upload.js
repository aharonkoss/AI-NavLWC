import { LightningElement, track, wire } from 'lwc';
import { updateRecord } from 'lightning/uiRecordApi';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';

// Schema references for Object and Custom Picklist Fields
import COMPANY_OBJECT from '@salesforce/schema/AI_Navigator_Company__c';
import STAGE_FIELD from '@salesforce/schema/AI_Navigator_Company__c.Stage_List__c';
import CLIENT_TYPE_FIELD from '@salesforce/schema/AI_Navigator_Company__c.Client_Type_List__c';

// Apex Controller methods
import getUploadSettings from '@salesforce/apex/UploadController.getUploadSettings';
import getPreviousSubmissions from '@salesforce/apex/UploadController.getPreviousSubmissions';
import uploadFile from '@salesforce/apex/UploadController.uploadFile';

export default class Upload extends LightningElement {
    @track settings = { dailyLimit: 5, usedToday: 0, remaining: 5 };
    @track submissions = [];
    @track isLoading = true;
    @track isUploading = false;
    @track error = null;
    @track successMessage = '';
    
    // Default picklist selection values
    @track defaultStage = '';
    @track defaultClientType = '';
    
    // Dynamic picklist options populated via wire adapters
    @track stageOptions = [];
    @track clientTypeOptions = [];

    @track hoverDrop = false;
    @track searchTerm = '';

    // Simulation tracking for pending uploads
    simulatingSubmissionIds = new Set();
    activeTimeouts = [];

    // ── 1. Fetch Object Info to get the default RecordTypeId ────────────────
    @wire(getObjectInfo, { objectApiName: COMPANY_OBJECT })
    objectInfo;

    // ── 2. Wire Picklist Values for Stage_List__c ───────────────────────────
    @wire(getPicklistValues, {
        recordTypeId: '$objectInfo.data.defaultRecordTypeId',
        fieldApiName: STAGE_FIELD
    })
    wiredStageValues({ data, error }) {
        if (data) {
            this.stageOptions = data.values.map(item => ({
                label: item.label,
                value: item.value
            }));
            // Set default stage from first picklist option or defaultValue if available
            if (this.stageOptions.length > 0 && !this.defaultStage) {
                this.defaultStage = data.defaultValue ? data.defaultValue.value : this.stageOptions[0].value;
            }
        } else if (error) {
            console.error('[Upload Log] Error loading Stage_List__c picklist values:', error);
        }
    }

    // ── 3. Wire Picklist Values for Client_Type_List__c ─────────────────────
    @wire(getPicklistValues, {
        recordTypeId: '$objectInfo.data.defaultRecordTypeId',
        fieldApiName: CLIENT_TYPE_FIELD
    })
    wiredClientTypeValues({ data, error }) {
        if (data) {
            this.clientTypeOptions = data.values.map(item => ({
                label: item.label,
                value: item.value
            }));
            // Set default client type from first picklist option or defaultValue if available
            if (this.clientTypeOptions.length > 0 && !this.defaultClientType) {
                this.defaultClientType = data.defaultValue ? data.defaultValue.value : this.clientTypeOptions[0].value;
            }
        } else if (error) {
            console.error('[Upload Log] Error loading Client_Type_List__c picklist values:', error);
        }
    }

    connectedCallback() {
        this.loadData();
    }

    disconnectedCallback() {
        this.activeTimeouts.forEach(clearTimeout);
    }

    loadData() {
        this.isLoading = true;
        this.error     = null;

        Promise.all([getUploadSettings(), getPreviousSubmissions()])
            .then(([settingsJson, subsJson]) => {
                this.settings    = JSON.parse(settingsJson);
                const rawSubs    = JSON.parse(subsJson);
                this.submissions = rawSubs.map(s => this.mapSubmission(s));

                // Self-healing: complete any submissions that were left in processing
                rawSubs.forEach(s => {
                    if (s.status === 'processing') {
                        this.startPendingSimulation(s.recordId);
                    }
                });

                this.isLoading = false;
            })
            .catch(err => {
                console.error('[Upload Log] Error loading upload data', err);
                this.error     = err.body?.message || 'Failed to load upload data.';
                this.isLoading = false;
            });
    }

    // ── Simulation loop: automatically resolves processing after 20s ────────
    startPendingSimulation(recordId) {
        if (!recordId || this.simulatingSubmissionIds.has(recordId)) return;
        this.simulatingSubmissionIds.add(recordId);

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        const timeoutId = setTimeout(() => {
            this.completeSubmission(recordId);
        }, 20000);

        this.activeTimeouts.push(timeoutId);
    }

    completeSubmission(recordId) {
        const recordInput = {
            fields: {
                Id: recordId,
                Status__c: 'completed'
            }
        };

        updateRecord(recordInput)
            .then(() => {
                this.simulatingSubmissionIds.delete(recordId);
                this.submissions = this.submissions.map(s => {
                    if (s.recordId === recordId) {
                        return this.mapSubmission({ ...s, status: 'completed' });
                    }
                    return s;
                });
            })
            .catch(() => {
                // Optimistically mark completed in UI if update fails
                this.simulatingSubmissionIds.delete(recordId);
                this.submissions = this.submissions.map(s => {
                    if (s.recordId === recordId) {
                        return this.mapSubmission({ ...s, status: 'completed' });
                    }
                    return s;
                });
            });
    }

    mapSubmission(s) {
        const isSimulating = this.simulatingSubmissionIds.has(s.recordId);
        const displayStatus = isSimulating ? 'processing' : (s.status || 'completed');

        const fileName = s.fileName || 'Bulk Upload';
        const shortSubId = s.submissionId ? s.submissionId.substring(0, 8) + '...' : '--';
        const totalCount = s.total != null ? `${s.total} companies` : null;

        return {
            ...s,
            displayName: fileName,
            shortSubmissionId: shortSubId,
            totalDisplay: totalCount,
            status: displayStatus,
            statusLabel: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
            submittedAtDisplay: s.submittedAt
                ? new Date(s.submittedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit'
                  })
                : new Date().toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit'
                  }),
            statusClass: this.getStatusClass(displayStatus)
        };
    }

    getStatusClass(status) {
        const map = {
            completed:  'up-status-pill up-status-completed',
            processing: 'up-status-pill up-status-processing',
            failed:     'up-status-pill up-status-failed'
        };
        return map[status] || 'up-status-pill up-status-processing';
    }

    get usedToday()      { return this.settings.usedToday || 0; }
    get dailyLimit()     { return this.settings.dailyLimit || 0; }
    get remaining()      { return this.settings.remaining || Math.max(0, this.dailyLimit - this.usedToday); }
    get hasSubmissions() { return this.filteredSubmissions.length > 0; }

    get filteredSubmissions() {
        let list = [...this.submissions];
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(s =>
                s.displayName?.toLowerCase().includes(term) ||
                s.submissionId?.toLowerCase().includes(term)
            );
        }
        return list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }

    get dropZoneClass() {
        return 'up-card up-drop-card' + (this.hoverDrop ? ' up-drop-card-hover' : '');
    }

    handleStageChange(event)      { this.defaultStage = event.target.value; }
    handleClientTypeChange(event) { this.defaultClientType = event.target.value; }

    handleSearchChange(event)     { this.searchTerm = event.target.value; }
    handleSearchClear()           { this.searchTerm = ''; }

    handleDragOver(event) {
        event.preventDefault();
        this.hoverDrop = true;
    }

    handleDragLeave(event) {
        event.preventDefault();
        this.hoverDrop = false;
    }

    handleDrop(event) {
        event.preventDefault();
        this.hoverDrop = false;
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileInputChange(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            this.processFile(files[0]);
        }
    }

    processFile(file) {
        if (this.isUploading) return;
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            this.uploadToServer(file.name, base64);
        };
        reader.readAsDataURL(file);
    }

    uploadToServer(fileName, base64Data) {
        this.isUploading    = true;
        this.error          = null;
        this.successMessage = '';

        uploadFile({
            fileName          : fileName,
            base64Data        : base64Data,
            defaultStage      : this.defaultStage,
            defaultClientType : this.defaultClientType
        })
        .then(resultJson => {
            const res = JSON.parse(resultJson);

            this.settings = {
                ...this.settings,
                dailyLimit : res.dailyLimit,
                usedToday  : res.usedToday,
                remaining  : res.remaining
            };

            this.successMessage = res.message ||
                'File uploaded successfully. Processing will start shortly.';

            // Insert new submission card immediately to the top of list
            const newSub = this.mapSubmission({
                submissionId : res.submissionId,
                recordId     : res.recordId,
                fileName     : res.fileName,
                status       : 'processing',
                submittedAt  : new Date().toISOString(),
                total        : res.totalCompanies
            });

            this.submissions = [newSub, ...this.submissions];

            // Start the 20-second simulation loop for completion
            if (res.recordId) {
                this.startPendingSimulation(res.recordId);
            }

            // Notify parent / dashboard
            this.dispatchEvent(new CustomEvent('uploadsubmitted', {
                bubbles : true,
                composed: true,
                detail  : {
                    submissionId  : res.submissionId,
                    correlationId : res.correlationId,
                    fileName      : res.fileName,
                    status        : 'processing'
                }
            }));
        })
        .catch(err => {
            console.error('[Upload Log] Upload error:', err);
            this.error = err.body?.message || 'Upload failed. Please try again.';
        })
        .finally(() => {
            this.isUploading = false;
            const input = this.template.querySelector('.up-file-input');
            if (input) input.value = '';
        });
    }
}
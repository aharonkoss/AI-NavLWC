import { LightningElement, track } from 'lwc';
import getUploadSettings    from '@salesforce/apex/UploadController.getUploadSettings';
import getPreviousSubmissions from '@salesforce/apex/UploadController.getPreviousSubmissions';
import uploadFile           from '@salesforce/apex/UploadController.uploadFile';
// STEP 3 PLACEHOLDER: import { subscribe, unsubscribe } from 'lightning/empApi';
//   Will be wired here to listen for BATCHPROGRESS and UPLOADPROCESSED events.

export default class Upload extends LightningElement {
    @track settings = { dailyLimit: 5, usedToday: 0, remaining: 5 };
    @track submissions = [];
    @track isLoading = true;
    @track isUploading = false;
    @track error = null;
    @track successMessage = '';
    @track defaultStage = 'PreCall';
    @track defaultClientType = 'Prospect';
    @track hoverDrop = false;
    @track searchTerm = '';
    // Holds real IDs after a successful upload — used by Step 3 EMP subscription
    _lastSubmissionId   = null;
    _lastCorrelationId  = null;

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

    connectedCallback() {
        this.loadData();
    }

    loadData() {
            this.isLoading = true;
            this.error     = null;

            Promise.all([getUploadSettings(), getPreviousSubmissions()])
                .then(([settingsJson, subsJson]) => {
                    this.settings    = JSON.parse(settingsJson);
                    const rawSubs    = JSON.parse(subsJson);
                    this.submissions = rawSubs.map(s => this.mapSubmission(s));
                    this.isLoading   = false;
                })
                .catch(err => {
                    console.error('Error loading upload data', err);
                    this.error     = err.body?.message || 'Failed to load upload data.';
                    this.isLoading = false;
                });
        }

    mapSubmission(s) {
        return {
            ...s,
            // Build display strings
            locationDisplay   : [s.city, s.state].filter(Boolean).join(', '),
            submittedAtDisplay: s.submittedAt
                ? new Date(s.submittedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit'
                  })
                : '--',
            statusClass: this.getStatusClass(s.status)
        };
    }

    getStatusClass(status) {
        const map = {
            completed:  'up-status-pill up-status-completed',
            processing: 'up-status-pill up-status-processing',
            failed:     'up-status-pill up-status-failed'
        };
        return map[status] || 'up-status-pill';
    }

    // Computed
    get usedToday()    { return this.settings.usedToday || 0; }
    get dailyLimit()   { return this.settings.dailyLimit || 0; }
    get remaining()    { return this.settings.remaining || Math.max(0, this.dailyLimit - this.usedToday); }
    get hasSubmissions() {
        return this.filteredSubmissions.length > 0;
    }

    get filteredSubmissions() {
        let list = [...this.submissions];
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(s =>
                s.companyName?.toLowerCase().includes(term) ||
                s.website?.toLowerCase().includes(term)
            );
        }
        return list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }
    get dropZoneClass() {
        return 'up-card up-drop-card' + (this.hoverDrop ? ' up-drop-card-hover' : '');
    }
    // Handlers
    handleStageChange(event)      { this.defaultStage = event.target.value; }
    handleClientTypeChange(event) { this.defaultClientType = event.target.value; }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    handleSearchClear() {
        this.searchTerm = '';
    }

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
            this.isUploading     = true;
            this.error           = null;
            this.successMessage  = '';

            uploadFile({
                fileName        : fileName,
                base64Data      : base64Data,
                defaultStage    : this.defaultStage,
                defaultClientType: this.defaultClientType
            })
            .then(resultJson => {
                const res = JSON.parse(resultJson);

                // Store real IDs for the EMP subscription in Step 3
                this._lastSubmissionId  = res.submissionId;
                this._lastCorrelationId = res.correlationId;

                // Update daily usage counters from real server values
                this.settings = {
                    ...this.settings,
                    dailyLimit : res.dailyLimit,
                    usedToday  : res.usedToday,
                    remaining  : res.remaining
                };

                this.successMessage = res.message ||
                    'File uploaded successfully. Processing will start shortly.';

                // Add the new submission optimistically to the top of the list
                // so the user sees it immediately without waiting for a re-query.
                // STEP 3: this card will update in real time via EMP subscription.
                const newSub = this.mapSubmission({
                    submissionId : res.submissionId,
                    recordId     : res.recordId,
                    fileName     : res.fileName,
                    status       : 'processing',
                    submittedAt  : new Date().toISOString(),
                    total        : null,
                    processed    : null,
                    failed       : null
                });
                this.submissions = [newSub, ...this.submissions];

                // Fire event so parent/dashboard can react if listening
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
                console.error('Upload error', err);
                this.error = err.body?.message || 'Upload failed. Please try again.';
            })
            .finally(() => {
                this.isUploading = false;
                // Clear file input so the same file can be re-selected if needed
                const input = this.template.querySelector('.up-file-input');
                if (input) input.value = '';
            });
        }
  // ── STEP 3 PLACEHOLDER ───────────────────────────────────────────────────
    // _subscription = null;
    //
    // After connectedCallback calls loadData(), we'll also subscribe here:
    // subscribe('/event/AINavigatorInbound__e', -1, (event) => {
    //     const payload = JSON.parse(event.data.payload.Payload__c);
    //     const evtType = event.data.payload.EventType__c;
    //     if (evtType === 'BATCHPROGRESS') this.handleBatchProgress(payload);
    //     if (evtType === 'UPLOADPROCESSED') this.handleUploadProcessed(payload);
    // }).then(sub => { this._subscription = sub; });
    //
    // disconnectedCallback() {
    //     if (this._subscription) unsubscribe(this._subscription, () => {});
    // }
}
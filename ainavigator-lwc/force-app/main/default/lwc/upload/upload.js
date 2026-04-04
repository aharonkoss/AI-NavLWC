import { LightningElement, track } from 'lwc';
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
    @track defaultStage = 'PreCall';
    @track defaultClientType = 'Prospect';
    @track hoverDrop = false;
    @track searchTerm = '';

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
        this.error = null;
        Promise.all([
            getUploadSettings(),
            getPreviousSubmissions()
        ])
        .then(([settingsJson, subsJson]) => {
            this.settings = JSON.parse(settingsJson);
            const rawSubs = JSON.parse(subsJson);
            this.submissions = rawSubs.map(s => this.mapSubmission(s));
            this.isLoading = false;
        })
        .catch(err => {
            console.error('Error loading upload data', err);
            this.error = err.body?.message || 'Failed to load upload data.';
            this.isLoading = false;
        });
    }

    mapSubmission(s) {
        return {
            ...s,
            locationDisplay: [s.city, s.state].filter(Boolean).join(', '),
            submittedAtDisplay: s.submittedAt
                ? new Date(s.submittedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit'
                  })
                : '-',
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
        this.isUploading = true;
        this.error = null;
        this.successMessage = '';
        uploadFile({
            fileName,
            base64Data,
            defaultStage: this.defaultStage,
            defaultClientType: this.defaultClientType
        })
        .then(resultJson => {
            const res = JSON.parse(resultJson);
            if (res.success) {
                this.settings = {
                    ...this.settings,
                    dailyLimit:  res.dailyLimit,
                    usedToday:   res.usedToday,
                    remaining:   res.remaining
                };
                this.successMessage = res.message || 'File uploaded successfully.';
                // Optionally refresh submissions
                return getPreviousSubmissions()
                    .then(subsJson => {
                        const raw = JSON.parse(subsJson);
                        this.submissions = raw.map(s => this.mapSubmission(s));
                    });
            } else {
                this.error = res.message || 'Upload failed.';
            }
        })
        .catch(err => {
            console.error('Upload error', err);
            this.error = err.body?.message || 'Upload failed.';
        })
        .finally(() => {
            this.isUploading = false;
            // clear file input value
            const input = this.template.querySelector('.up-file-input');
            if (input) input.value = '';
        });
    }
}
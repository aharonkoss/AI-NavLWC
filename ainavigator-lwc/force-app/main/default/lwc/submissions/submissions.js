import { LightningElement, track } from 'lwc';
import getSubmissions from '@salesforce/apex/SubmissionsController.getSubmissions';

export default class Submissions extends LightningElement {
    @track submissions = [];
    @track isLoading = true;
    @track error = null;
    @track filter = 'all'; // all | upload | input | status:completed | status:processing | status:failed
    @track searchTerm = '';

    connectedCallback() {
        this.loadSubmissions();
    }

    loadSubmissions() {
        this.isLoading = true;
        this.error = null;
        getSubmissions()
            .then(result => {
                const raw = JSON.parse(result);
                this.submissions = raw.map(s => this.mapSubmission(s));
                this.isLoading = false;
            })
            .catch(err => {
                console.error('Error loading submissions', err);
                this.error = err.body?.message || 'Failed to load submissions.';
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
            sourceLabel: s.source === 'Upload' ? 'Upload' : 'Input',
            sourceClass: s.source === 'Upload'
                ? 'sub-badge sub-badge-upload'
                : 'sub-badge sub-badge-input',
            statusClass: this.getStatusClass(s.status)
        };
    }

    getStatusClass(status) {
        const map = {
            completed:  'status-pill status-pill-completed',
            processing: 'status-pill status-pill-processing',
            failed:     'status-pill status-pill-failed'
        };
        return map[status] || 'status-pill';
    }

    // ── Filters / Search ──
    handleFilterChange(event) {
        this.filter = event.target.value;
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    handleClearSearch() {
        this.searchTerm = '';
    }

    get filteredSubmissions() {
        let list = [...this.submissions];

        // Filter by source / status
        if (this.filter === 'upload') {
            list = list.filter(s => s.source === 'Upload');
        } else if (this.filter === 'input') {
            list = list.filter(s => s.source === 'Input');
        } else if (this.filter.startsWith('status:')) {
            const val = this.filter.replace('status:', '');
            list = list.filter(s => s.status === val);
        }

        // Search by company name or website
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(s =>
                s.companyName?.toLowerCase().includes(term) ||
                s.website?.toLowerCase().includes(term)
            );
        }

        // Sort: newest first
        return list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }

    get hasSubmissions() {
        return this.filteredSubmissions.length > 0;
    }

    get filterOptions() {
        return [
            { label: 'All', value: 'all' },
            { label: 'Upload only', value: 'upload' },
            { label: 'Input only', value: 'input' },
            { label: 'Completed', value: 'status:completed' },
            { label: 'Processing', value: 'status:processing' },
            { label: 'Failed', value: 'status:failed' }
        ];
    }

    get emptyMessage() {
        if (this.searchTerm) return `No submissions found matching "${this.searchTerm}"`;
        if (this.filter !== 'all') return 'No submissions match this filter.';
        return 'No submissions yet.';
    }

    handleRefresh() {
        this.loadSubmissions();
    }
}
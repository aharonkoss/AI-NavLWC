/**
 * submissions.js
 * Step 3 — wired to real SubmissionsController SOQL.
 *           EMP subscription for BATCH_PROGRESS added to update
 *           in-memory records without a full re-query.
 *
 * Platform Event channel: /event/AINavigatorInbound__e
 * Filtered on: Event_Type__c IN ('BATCH_PROGRESS','UPLOADPROCESSED')
 */
import { LightningElement, track } from 'lwc';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';
import getSubmissions from '@salesforce/apex/SubmissionsController.getSubmissions';

const CHANNEL = '/event/AINavigatorInbound__e';

export default class Submissions extends LightningElement {
    @track submissions   = [];
    @track isLoading     = true;
    @track error         = null;
    @track filter        = 'all';
    @track searchTerm    = '';

    _subscription = null;   // EMP subscription handle

    // ── Lifecycle ────────────────────────────────────────────────────────────

    connectedCallback() {
        this.loadSubmissions();
        this._subscribeToEvents();
    }

    disconnectedCallback() {
        this._unsubscribeFromEvents();
    }

    // ── Data Load ────────────────────────────────────────────────────────────

    loadSubmissions() {
        this.isLoading = true;
        this.error     = null;

        getSubmissions()
            .then(result => {
                const raw = JSON.parse(result);
                this.submissions = raw.map(s => this._mapSubmission(s));
                this.isLoading   = false;
            })
            .catch(err => {
                console.error('[Submissions] load error', err);
                this.error     = err.body?.message || 'Failed to load submissions.';
                this.isLoading = false;
            });
    }

    // ── EMP / Platform Event Subscription ────────────────────────────────────

    _subscribeToEvents() {
        onError(error => {
            console.error('[Submissions] EMP error', error);
        });

        subscribe(CHANNEL, -1, event => {
            this._handlePlatformEvent(event);
        })
        .then(subscription => {
            this._subscription = subscription;
        })
        .catch(err => {
            console.error('[Submissions] subscribe error', err);
        });
    }

    _unsubscribeFromEvents() {
        if (this._subscription) {
            unsubscribe(this._subscription, () => {
                this._subscription = null;
            });
        }
    }

    /**
     * Routes inbound platform events to the correct handler.
     * Event payload sits in event.data.payload (EMP API wrapper).
     */
    _handlePlatformEvent(event) {
        const payload   = event?.data?.payload;
        if (!payload) return;

        const eventType = payload.Event_Type__c;

        if (eventType === 'BATCH_PROGRESS') {
            this._handleBatchProgress(payload);
            return;
        }

        // UPLOADPROCESSED — schema TBD from Azure developer.
        // Is_Active__c is false in the custom metadata until confirmed.
        // When confirmed, update AI_Navigator_Event_Schema.UPLOADPROCESSED_v1
        // and flip Is_Active__c = true. No Apex code changes needed.
        if (eventType === 'UPLOAD_PROCESSED') {
            this._handleUploadProcessed(payload);
        }
    }

    /**
     * BATCH_PROGRESS — update an in-flight submission's progress counters
     * without a full re-query.
     *
     * Expected Payload__c fields (BatchProgress.v1):
     *   submissionId              string  — matches Submission__c.Submission_Id__c
     *   processed                 integer — companies completed so far
     *   total                     integer — total companies in batch
     *   failed                    integer — companies that errored
     *   currentCompany            string  — name of company currently processing
     *   estimatedSecondsRemaining integer — ETA in seconds
     */
    _handleBatchProgress(payload) {
        let rawPayload;
        try {
            // Payload__c arrives as a JSON string inside the platform event
            rawPayload = typeof payload.Payload__c === 'string'
                ? JSON.parse(payload.Payload__c)
                : payload.Payload__c;
        } catch (e) {
            console.error('[Submissions] BATCH_PROGRESS parse error', e);
            return;
        }

        const { submissionId, processed, total, failed, currentCompany, estimatedSecondsRemaining } = rawPayload;
        if (!submissionId) return;

        this.submissions = this.submissions.map(s => {
            if (s.submissionId !== submissionId) return s;

            const progressPct = total > 0
                ? Math.min(100, Math.round((processed / total) * 100))
                : 0;

            const isComplete = total > 0 && (processed + failed) >= total;

            return this._mapSubmission({
                ...s,
                status            : isComplete ? this._deriveCompletionStatus(processed, failed, total) : 'processing',
                totalCompanies    : total,
                processed,
                failed,
                progressPct,
                isComplete,
                currentCompany,
                estimatedSecondsRemaining
            });
        });
    }

    /**
     * UPLOADPROCESSED — Azure fires this when the full batch is done.
     * Schema is PENDING Azure developer confirmation.
     * Handler is safe to call now; it will no-op until the event fires.
     *
     * Assumed Payload__c fields (to be confirmed):
     *   submissionId   string
     *   totalCompanies integer
     *   completed      integer
     *   failed         integer
     *   finalStatus    string  — completed | partial | failed
     */
    _handleUploadProcessed(payload) {
        let rawPayload;
        try {
            rawPayload = typeof payload.Payload__c === 'string'
                ? JSON.parse(payload.Payload__c)
                : payload.Payload__c;
        } catch (e) {
            console.error('[Submissions] UPLOADPROCESSED parse error', e);
            return;
        }

        const { submissionId, finalStatus, totalCompanies, completed, failed } = rawPayload;
        if (!submissionId) return;

        this.submissions = this.submissions.map(s => {
            if (s.submissionId !== submissionId) return s;

            return this._mapSubmission({
                ...s,
                status         : finalStatus || this._deriveCompletionStatus(completed, failed, totalCompanies),
                totalCompanies : totalCompanies ?? s.totalCompanies,
                processed      : completed    ?? s.processed,
                failed         : failed       ?? s.failed,
                progressPct    : 100,
                isComplete     : true
            });
        });
    }

    // ── Mapping Helpers ──────────────────────────────────────────────────────

    _mapSubmission(s) {
        return {
            ...s,
            // Display name: file name for Uploads, generic label for Input
            displayName   : s.source === 'Upload'
                ? (s.fileName || 'Uploaded File')
                : 'Manual Input',
            submittedAtDisplay: s.submittedAt
                ? new Date(s.submittedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: '2-digit'
                  })
                : '-',
            sourceLabel   : s.source === 'Upload' ? 'Upload' : 'Input',
            sourceClass   : s.source === 'Upload'
                ? 'sub-badge sub-badge-upload'
                : 'sub-badge sub-badge-input',
            statusClass   : this._getStatusClass(s.status),
            progressLabel : s.totalCompanies > 0
                ? `${s.processed ?? 0} / ${s.totalCompanies}`
                : null
        };
    }

    _getStatusClass(status) {
        const map = {
            completed  : 'status-pill status-pill-completed',
            processing : 'status-pill status-pill-processing',
            failed     : 'status-pill status-pill-failed',
            partial    : 'status-pill status-pill-partial',
            pending    : 'status-pill status-pill-pending'
        };
        return map[status] || 'status-pill';
    }

    /**
     * Derive a final status from raw counts when no explicit finalStatus
     * field is present in the payload (BATCH_PROGRESS completion path).
     */
    _deriveCompletionStatus(processed, failed, total) {
        if (!failed || failed === 0) return 'completed';
        if (!processed || processed === 0) return 'failed';
        return 'partial';
    }

    // ── Filters / Search ────────────────────────────────────────────────────

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

        if (this.filter === 'upload') {
            list = list.filter(s => s.source === 'Upload');
        } else if (this.filter === 'input') {
            list = list.filter(s => s.source === 'Input');
        } else if (this.filter.startsWith('status:')) {
            const val = this.filter.replace('status:', '');
            list = list.filter(s => s.status === val);
        }

        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(s =>
                s.displayName?.toLowerCase().includes(term) ||
                s.fileName?.toLowerCase().includes(term)
            );
        }

        return list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }

    get hasSubmissions()   { return this.filteredSubmissions.length > 0; }
    get isProcessingAny()  { return this.submissions.some(s => s.status === 'processing'); }

    get filterOptions() {
        return [
            { label: 'All',        value: 'all' },
            { label: 'Upload only',value: 'upload' },
            { label: 'Input only', value: 'input' },
            { label: 'Completed',  value: 'status:completed' },
            { label: 'Partial',    value: 'status:partial' },
            { label: 'Processing', value: 'status:processing' },
            { label: 'Failed',     value: 'status:failed' }
        ];
    }

    get emptyMessage() {
        if (this.searchTerm)    return `No submissions found matching "${this.searchTerm}"`;
        if (this.filter !== 'all') return 'No submissions match this filter.';
        return 'No submissions yet.';
    }

    handleRefresh() {
        this.loadSubmissions();
    }
}
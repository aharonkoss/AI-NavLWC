import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

// Apex Picklist Imports
import getStageOptions from '@salesforce/apex/DashboardController.getStageOptions';
import getClientTypeOptions from '@salesforce/apex/DashboardController.getClientTypeOptions';

// Other Apex Imports
import getDashboardStats from '@salesforce/apex/DashboardController.getDashboardStats';
import getCompanies from '@salesforce/apex/DashboardController.getCompanies';
import getSignals from '@salesforce/apex/DashboardController.getSignals';
import getPipelineStatus from '@salesforce/apex/DashboardController.getPipelineStatus';
import updateCompany from '@salesforce/apex/DashboardController.updateCompany';
import deleteCompany from '@salesforce/apex/DashboardController.deleteCompany';
import getTeammates from '@salesforce/apex/DashboardController.getTeammates';
import shareCompanies from '@salesforce/apex/DashboardController.shareCompanies';
import getSharedUsers from '@salesforce/apex/DashboardController.getSharedUsers';
import unshareCompany from '@salesforce/apex/DashboardController.unshareCompany';

const POLLING_INTERVAL_MS = 5000;

export default class Dashboard extends NavigationMixin(LightningElement) {
    @track stats = { totalCompanies: 0, processing: 0, completed: 0, opened: 0 };
    @track _companies = [];
    @track _companySignals = {};
    @track searchTerm = '';
    @track companyFilter = 'all';
    @track dateFilter = '';
    @track currentPage = 1;
    ITEMS_PER_PAGE = 10;

    // Picklist Options from Apex Schema
    @track stageOptions = [];
    @track clientTypeOptions = [];

    // --- Sharing State ---
    @track selectedCompanyIds = new Set();
    @track shareTargetUserId = '';
    @track isSharing = false;
    @track shareMessage = null;
    
    // --- Unshare Modal State ---
    @track isUnshareModalOpen = false;
    @track currentUnshareCompanyId = '';
    @track currentUnshareCompanyName = '';
    @track sharedWithUsersList = [];
    
    // --- Delete Modal State ---
    @track isDeleteModalOpen = false;
    @track companyToDeleteId = '';
    @track companyToDeleteName = '';

    // --- Polling Tracking ---
    pollingIntervalId = null;
    isPollingActive = false;

    // Fetch teammates
    @wire(getTeammates)
    teammates;

    connectedCallback() {
        this.loadStats();
        this.loadPicklistOptions();
        window.addEventListener('companysubmitted', this.handleCompanySubmitted);
    }

    disconnectedCallback() {
        window.removeEventListener('companysubmitted', this.handleCompanySubmitted);
        this.stopPolling();
    }

    // Load Apex picklist values first, then companies
    loadPicklistOptions() {
        Promise.all([getStageOptions(), getClientTypeOptions()])
            .then(([stagesJson, clientTypesJson]) => {
                this.stageOptions = JSON.parse(stagesJson);
                this.clientTypeOptions = JSON.parse(clientTypesJson);
                this.loadCompanies();
            })
            .catch(error => {
                console.error('[Dashboard Log] Error loading picklist options:', error);
                this.loadCompanies();
            });
    }

    // --- Polling Lifecycle ---
    startPolling() {
        if (this.pollingIntervalId) return;

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.pollingIntervalId = setInterval(() => {
            this.pollUncompletedCompanies();
        }, POLLING_INTERVAL_MS);
    }

    stopPolling() {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
        }
    }

    pollUncompletedCompanies() {
        if (this.isPollingActive) return;

        const uncompleted = this._companies.filter(c => c.status !== 'completed');
        if (uncompleted.length === 0) {
            this.stopPolling();
            return;
        }

        this.isPollingActive = true;

        const pollPromises = uncompleted.map(comp => {
            return getPipelineStatus({ salesforceCompanyId: comp.companyId })
                .then(result => {
                    const data = JSON.parse(result);
                    const newStatus = (data.status || comp.status || 'processing').toLowerCase();
                    const newStage = data.currentStage || comp.currentStage || null;
                    const percentComplete = data.percentComplete || 0;
                    const hasCompleted = newStatus === 'completed';

                    this._companies = this._companies.map(c => {
                        if (c.companyId === comp.companyId) {
                            return this.mapCompany({
                                ...c,
                                status: newStatus,
                                currentStage: newStage,
                                percentComplete: percentComplete
                            });
                        }
                        return c;
                    });

                    if (hasCompleted) {
                        this.loadSignalsForCompany(comp.companyId);
                        this.loadStats();
                    }
                })
                .catch(error => {
                    console.error('[Dashboard Log] Error polling pipeline status for:', comp.companyId, error);
                });
        });

        Promise.allSettled(pollPromises).finally(() => {
            this.isPollingActive = false;
            this._companies = [...this._companies];

            const remaining = this._companies.filter(c => c.status !== 'completed');
            if (remaining.length === 0) {
                this.stopPolling();
            }
        });
    }

    handleCompanySubmitted = (event) => {
        const payload = event.detail;
        if (!payload || !payload.companyId) return;

        const submittedCompany = this.mapCompany({
            companyId: payload.companyId,
            azureCompanyId: payload.azureCompanyId,
            correlationId: payload.correlationId,
            name: payload.name,
            city: payload.city,
            state: payload.state,
            stage: payload.stage,
            clientType: payload.clientType,
            status: 'pending',
            currentStage: 'submitted',
            createdAt: payload.createdAt || new Date().toISOString()
        });

        const index = this._companies.findIndex(c => c.companyId === submittedCompany.companyId);
        if (index !== -1) {
            this._companies[index] = submittedCompany;
        } else {
            this._companies = [submittedCompany, ...this._companies];
        }

        this._companies = [...this._companies];
        this.startPolling();
    };

    loadStats() {
        getDashboardStats()
            .then(result => { this.stats = JSON.parse(result); })
            .catch(error => console.error('Error loading stats:', error));
    }

    loadCompanies() {
        getCompanies()
            .then(result => {
                const raw = JSON.parse(result);
                this._companies = raw.map(c => this.mapCompany(c));

                let hasUncompleted = false;
                raw.forEach(c => {
                    if (c.status !== 'completed') {
                        hasUncompleted = true;
                    }
                    this.loadSignalsForCompany(c.companyId);
                });

                if (hasUncompleted) {
                    this.startPolling();
                    this.pollUncompletedCompanies();
                }
            })
            .catch(error => console.error('Error loading companies:', error));
    }

    loadSignalsForCompany(companyId) {
        getSignals({ companyId })
            .then(result => {
                const data = JSON.parse(result);
                const signals = Array.isArray(data) ? data : (data.signals || []);
                this._companySignals = { ...this._companySignals, [companyId]: signals };
                this._companies = this._companies.map(c =>
                    c.companyId === companyId ? this.mapCompany(c, signals) : c
                );
            })
            .catch(error => console.error('Error loading signals for', companyId, error));
    }

    // Consolidated mapCompany method
    mapCompany(c, signals) {
        const displayStatus = c.status || 'pending';
        const isCompleted = displayStatus === 'completed';

        // Keep existing stage/clientType or fallback to first option from schema
        const currentStage = c.stage || (this.stageOptions.length > 0 ? this.stageOptions[0].value : '');
        const currentClientType = c.clientType || (this.clientTypeOptions.length > 0 ? this.clientTypeOptions[0].value : '');

        const companySignals = signals || this._companySignals[c.companyId] || [];
        const signalSummary = this.getSignalSummary(companySignals);

        const statusLabel = displayStatus ? displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1) : 'Unknown';
        
        let statusDisplay = statusLabel;
        if (!isCompleted && c.currentStage) {
            statusDisplay = `${statusLabel}: ${c.currentStage}`;
        }
        
        return {
            ...c,
            stage: currentStage,
            clientType: currentClientType,
            status: displayStatus,
            currentStage: c.currentStage || null,
            locationDisplay: [c.city, c.state].filter(Boolean).join(', '),
            createdAtDisplay: c.createdAt
                ? new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                : '-',
            statusClass: this.getStatusClass(displayStatus),
            statusLabel: statusLabel,
            statusDisplay: statusDisplay,
            isProcessing: !isCompleted && (displayStatus === 'processing' || displayStatus === 'pending'),
            
            // Dynamic Picklist Options for HTML template (template for:each={company.stageOptions})
            stageOptions: this.stageOptions.map(opt => ({
                ...opt,
                isSelected: opt.value === currentStage
            })),
            clientTypeOptions: this.clientTypeOptions.map(opt => ({
                ...opt,
                isSelected: opt.value === currentClientType
            })),

            // Sharing UI Logic
            isSelected: this.selectedCompanyIds.has(c.companyId),
            hasSharedLabel: !!c.sharedByName, 
            sharedByLabel: `Shared by ${c.sharedByName}`,
            showUnshareButton: c.isShared && !c.sharedByName,
            showShareButton: !c.isShared && !c.sharedByName && displayStatus === 'completed',
            
            hasSignals: signalSummary !== null,
            signalBadgeLabel: signalSummary
                ? (signalSummary.warningCount > 0
                    ? `${signalSummary.count} (${signalSummary.warningCount})`
                    : `${signalSummary.count}`)
                : 'Signals',
            signalBadgeClass: 'signal-badge ' + (signalSummary ? this.getSignalBadgeClass(signalSummary.maxPriority) : 'signal-default')
        };
    }

    // --- Picklist Change Handlers ---
    handleStageChange(event) {
        event.stopPropagation();
        const companyId = event.target.dataset.companyid;
        const newStage = event.target.value;
        
        const oldCompany = this._companies.find(c => c.companyId === companyId);
        const oldStage = oldCompany ? oldCompany.stage : '';

        this._companies = this._companies.map(c => 
            c.companyId === companyId ? this.mapCompany({ ...c, stage: newStage }) : c
        );

        updateCompany({ companyId: companyId, stage: newStage, clientType: null })
            .then(() => {
                this.showCustomToast(`Stage updated to ${newStage}`, 'success');
            })
            .catch(error => {
                console.error('[Dashboard Log] Error updating stage:', error);
                this.showCustomToast('Failed to update stage: ' + (error.body?.message || error.message), 'error');
                this._companies = this._companies.map(c => 
                    c.companyId === companyId ? this.mapCompany({ ...c, stage: oldStage }) : c
                );
            });
    }

    handleClientTypeChange(event) {
        event.stopPropagation();
        const companyId = event.target.dataset.companyid;
        const newClientType = event.target.value;

        const oldCompany = this._companies.find(c => c.companyId === companyId);
        const oldClientType = oldCompany ? oldCompany.clientType : '';

        this._companies = this._companies.map(c => 
            c.companyId === companyId ? this.mapCompany({ ...c, clientType: newClientType }) : c
        );

        updateCompany({ companyId: companyId, stage: null, clientType: newClientType })
            .then(() => {
                this.showCustomToast(`Client Type updated to ${newClientType}`, 'success');
            })
            .catch(error => {
                console.error('[Dashboard Log] Error updating client type:', error);
                this.showCustomToast('Failed to update client type: ' + (error.body?.message || error.message), 'error');
                this._companies = this._companies.map(c => 
                    c.companyId === companyId ? this.mapCompany({ ...c, clientType: oldClientType }) : c
                );
            });
    }

    // --- Selection Handlers ---
    handleRowSelect(event) {
        event.stopPropagation(); 
        const companyId = event.target.dataset.companyid; 
        
        if (this.selectedCompanyIds.has(companyId)) {
            this.selectedCompanyIds.delete(companyId);
        } else {
            this.selectedCompanyIds.add(companyId);
        }
        this._updateSelectionState();
    }

    handleSelectAll(event) {
        const checked = event.target.checked;
        if (checked) {
            this.paginatedCompanies.forEach(c => {
                if (c.status === 'completed' && !c.sharedByName) {
                    this.selectedCompanyIds.add(c.companyId);
                }
            });
        } else {
            this.selectedCompanyIds.clear();
        }
        this._updateSelectionState();
    }

    _updateSelectionState() {
        this._companies = this._companies.map(c => ({
            ...c,
            isSelected: this.selectedCompanyIds.has(c.companyId)
        }));
        this.selectedCompanyIds = new Set(this.selectedCompanyIds);
    }

    // --- Sharing Actions ---
    handleTeammateChange(event) {
        this.shareTargetUserId = event.target.value;
    }

    handleShare() {
        if (!this.shareTargetUserId || this.selectedCompanyIds.size === 0) return;

        this.isSharing = true;
        shareCompanies({ 
            companyIds: Array.from(this.selectedCompanyIds), 
            targetUserId: this.shareTargetUserId 
        })
        .then(() => {
            this.showCustomToast('Companies shared successfully', 'success');
            this.selectedCompanyIds.clear();
            this.shareTargetUserId = '';
            this.loadCompanies(); 
            this.loadStats();
        })
        .catch(error => {
            this.showCustomToast('Failed to share: ' + (error.body ? error.body.message : error.message), 'error');
        })
        .finally(() => {
            this.isSharing = false;
        });
    }

    handleCancelSelection() {
        this.selectedCompanyIds.clear();
        this.shareTargetUserId = '';
        this._updateSelectionState();
    }

    stopPropagation(event) {
        event.stopPropagation();
    }

    handleOpenUnshareModal(event) {
        event.stopPropagation();
        const companyId = event.currentTarget.dataset.companyid;
        const comp = this._companies.find(c => c.companyId === companyId);
        
        this.currentUnshareCompanyId = companyId;
        this.currentUnshareCompanyName = comp ? comp.name : '';
        
        getSharedUsers({ companyId })
            .then(result => {
                this.sharedWithUsersList = result;
                this.isUnshareModalOpen = true;
            })
            .catch(error => console.error(error));
    }

    handleCloseUnshareModal() {
        this.isUnshareModalOpen = false;
        this.sharedWithUsersList = [];
    }

    handleConfirmUnshare(event) {
        const sharedRecordId = event.currentTarget.dataset.sharedid;
        unshareCompany({ sharedCompanyRecordId: sharedRecordId })
            .then(() => {
                this.showCustomToast('Access removed', 'success');
                this.sharedWithUsersList = this.sharedWithUsersList.filter(u => u.id !== sharedRecordId);
                if (this.sharedWithUsersList.length === 0) {
                    this.handleCloseUnshareModal();
                }
                this.loadCompanies(); 
            })
            .catch(() => {
                this.showCustomToast('Error removing access', 'error');
            });
    }

    showCustomToast(text, type) {
        this.shareMessage = { text, type };
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.shareMessage = null;
        }, 4000);
    }

    get toastClass() {
        return this.shareMessage 
            ? `custom-toast toast-${this.shareMessage.type}` 
            : 'custom-toast';
    }

    get showShareToolbar() {
        return this.selectedCompanyIds.size > 0;
    }

    get selectionCountLabel() {
        return `${this.selectedCompanyIds.size} selected`;
    }

    get isShareDisabled() {
        return !this.shareTargetUserId || this.isSharing;
    }

    // --- Helper Logic ---
    getSignalSummary(signals) {
        if (!signals || signals.length === 0) return null;
        const nonNeutral = signals.filter(s => s.signalType !== 'Neutral');
        if (nonNeutral.length === 0) return null;
        const priorities = nonNeutral.map(s => this.getSignalPriority(s));
        const maxPriority = Math.max(...priorities);
        const warningCount = nonNeutral.filter(s =>
            s.signalType === 'Early Warning' || s.signalType === 'Retention Risk'
        ).length;
        return { count: nonNeutral.length, maxPriority, warningCount };
    }

    getSignalPriority(signal) {
        const type = (signal.signalType || '').toLowerCase();
        const category = (signal.signalCategory || signal.signalType || '').toLowerCase();
        const name = (signal.signalName || signal.headline || '').toLowerCase();
        if (category.includes('capital') || category.includes('m&a') || category.includes('acquisition')) return 5;
        if (name.includes('acquisition') || name.includes('capital') || name.includes('funding')) return 5;
        if (category.includes('leadership') || name.includes('cfo') || name.includes('ceo')) return 4;
        if (type.includes('early warning') || category.includes('growth')) return 4;
        if (type.includes('retention risk') || category.includes('risk') || category.includes('regulatory')) return 3;
        if (category.includes('strategic') || category.includes('expansion')) return 2;
        if (type.includes('opportunity')) return 2;
        return 1;
    }

    getSignalBadgeClass(priority) {
        const map = { 5: 'signal-p5', 4: 'signal-p4', 3: 'signal-p3', 2: 'signal-p2', 1: 'signal-p1' };
        return map[priority] || 'signal-p1';
    }

    getStatusClass(status) {
        const map = {
            completed:  'status-badge status-completed',
            processing: 'status-badge status-processing',
            pending:    'status-badge status-pending',
            failed:     'status-badge status-failed'
        };
        return map[status] || 'status-badge status-pending';
    }

    // --- Dynamic KPI Stats Getters ---
    get totalCompanies() { 
        return this._companies.length > 0 ? this._companies.length : (this.stats.totalCompanies || 0); 
    }
    get processing() { 
        return this._companies.length > 0 
            ? this._companies.filter(c => c.status === 'processing' || c.status === 'pending').length 
            : (this.stats.processing || 0); 
    }
    get completed() { 
        return this._companies.length > 0 
            ? this._companies.filter(c => c.status === 'completed').length 
            : (this.stats.completed || 0); 
    }
    get opened() { 
        return this._companies.length > 0 
            ? this._companies.filter(c => c.status === 'opened').length 
            : (this.stats.opened || 0); 
    }

    // Dynamic Filter Options driven by schema picklists
    get filterOptions() {
        const baseBefore = [
            { label: 'All',           value: 'all' },
            { label: 'Most Recent 2', value: 'recent2' }
        ];

        const clientTypeFilters = this.clientTypeOptions.map(opt => ({
            label: `Client: ${opt.label}`,
            value: `clientType:${opt.value}`
        }));

        const stageFilters = this.stageOptions.map(opt => ({
            label: `Stage: ${opt.label}`,
            value: `stage:${opt.value}`
        }));

        const baseAfter = [
            { label: 'Status: Completed',  value: 'status:completed' },
            { label: 'Status: Processing', value: 'status:processing' },
            { label: 'Status: Pending',    value: 'status:pending' },
            { label: 'Status: Failed',     value: 'status:failed' },
            { label: 'By Date Submitted',  value: 'byDate' }
        ];

        return [...baseBefore, ...clientTypeFilters, ...stageFilters, ...baseAfter];
    }

    get showDateFilter()  { return this.companyFilter === 'byDate'; }
    get showClearFilter() { return this.companyFilter !== 'all' || this.searchTerm; }

    get filteredCompanies() {
        let sorted = [...this._companies].sort((a, b) => {
            const p = s => s === 'processing' ? 2 : s === 'pending' ? 1 : 0;
            const diff = p(b.status) - p(a.status);
            if (diff !== 0) return diff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        if (this.companyFilter === 'recent2') {
            sorted = sorted.slice(0, 2);
        } else if (this.companyFilter.startsWith('clientType:')) {
            const val = this.companyFilter.replace('clientType:', '');
            sorted = sorted.filter(c => c.clientType === val);
        } else if (this.companyFilter.startsWith('stage:')) {
            const val = this.companyFilter.replace('stage:', '');
            sorted = sorted.filter(c => c.stage === val);
        } else if (this.companyFilter.startsWith('status:')) {
            const val = this.companyFilter.replace('status:', '');
            sorted = sorted.filter(c => c.status === val);
        } else if (this.companyFilter === 'byDate' && this.dateFilter) {
            sorted = sorted.filter(c => c.createdAt && c.createdAt.startsWith(this.dateFilter));
        }
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            sorted = sorted.filter(c =>
                c.name?.toLowerCase().includes(term) ||
                c.city?.toLowerCase().includes(term) ||
                c.state?.toLowerCase().includes(term) ||
                c.website?.toLowerCase().includes(term)
            );
        }
        return sorted;
    }

    get totalPages() {
        return this.companyFilter === 'all' ? Math.ceil(this.filteredCompanies.length / this.ITEMS_PER_PAGE) : 1;
    }

    get paginatedCompanies() {
        if (this.companyFilter !== 'all' || this.filteredCompanies.length <= this.ITEMS_PER_PAGE) {
            return this.filteredCompanies;
        }
        const start = (this.currentPage - 1) * this.ITEMS_PER_PAGE;
        return this.filteredCompanies.slice(start, start + this.ITEMS_PER_PAGE);
    }

    get hasCompanies()   { return this.paginatedCompanies.length > 0; }
    get showPagination() { return this.totalPages > 1; }
    get isFirstPage()    { return this.currentPage === 1; }
    get isLastPage()     { return this.currentPage === this.totalPages; }
    get filteredCount()  { return this.filteredCompanies.length; }

    get paginationLabel() {
        const start = (this.currentPage - 1) * this.ITEMS_PER_PAGE + 1;
        const end = Math.min(this.currentPage * this.ITEMS_PER_PAGE, this.filteredCompanies.length);
        return `${start}–${end} of ${this.filteredCompanies.length}`;
    }

    get emptyMessage() {
        if (this.searchTerm) return `No companies found matching "${this.searchTerm}"`;
        if (this.companyFilter !== 'all') return 'No companies match this filter.';
        return 'No companies yet.';
    }

    handleSearchChange(event)     { this.searchTerm = event.target.value; this.currentPage = 1; }
    handleClearSearch()           { this.searchTerm = ''; this.currentPage = 1; }
    handleFilterChange(event)     { this.companyFilter = event.target.value; if (this.companyFilter !== 'byDate') this.dateFilter = ''; this.currentPage = 1; }
    handleDateFilterChange(event) { this.dateFilter = event.target.value; this.currentPage = 1; }
    handleClearFilter()           { this.companyFilter = 'all'; this.dateFilter = ''; this.searchTerm = ''; this.currentPage = 1; }
    handlePrevPage()              { if (this.currentPage > 1) this.currentPage--; }
    handleNextPage()              { if (this.currentPage < this.totalPages) this.currentPage++; }

    handleOpenSignals(event) {
        const companyId = event.currentTarget.dataset.companyid;
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Company_Detail' },
            state: { c__companyId: companyId, c__tab: 'signals' }
        });
    }

    handleDelete(event) {
        event.stopPropagation();
        const companyId = event.currentTarget ? event.currentTarget.dataset.companyid : null;
        const company = this._companies.find(c => c.companyId === companyId);
        if (!company) return;

        this.companyToDeleteId = companyId;
        this.companyToDeleteName = company.name;
        this.isDeleteModalOpen = true;
    }

    handleConfirmDelete() {
        const companyId = this.companyToDeleteId;
        const company = this._companies.find(c => c.companyId === companyId);
        if (!company) {
            this.handleCloseDeleteModal();
            return;
        }

        this._companies = this._companies.filter(c => c.companyId !== companyId);
        this.handleCloseDeleteModal();

        deleteCompany({ companyId })
            .then(() => {
                this.showCustomToast('Company deleted successfully', 'success');
                this.loadStats();
            })
            .catch(error => {
                console.error('[Dashboard Log] Delete action failed:', error);
                this.showCustomToast('Failed to delete company', 'error');
                this._companies = [...this._companies, company];
            });
    }

    handleCloseDeleteModal() {
        this.isDeleteModalOpen = false;
        this.companyToDeleteId = '';
        this.companyToDeleteName = '';
    }

    handleCompanyClick(event) {
        const companyId = event.currentTarget.dataset.companyid; 
        if (!companyId) return;

        const company = this._companies.find(c => c.companyId === companyId);
        
        this.dispatchEvent(new CustomEvent('companyselect', { 
            detail: { companyId: companyId, companyName: company ? company.name : '' }
        }));

        const url = new URL(window.location.href);
        url.searchParams.set('c__companyId', companyId);
        url.searchParams.set('c__tab', 'research');
        window.history.pushState({}, '', url.toString());
    }
}
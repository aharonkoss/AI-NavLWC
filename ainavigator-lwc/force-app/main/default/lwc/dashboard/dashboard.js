import { LightningElement, track, wire } from 'lwc'; // Added 'wire' here
import { NavigationMixin } from 'lightning/navigation';
import getDashboardStats from '@salesforce/apex/DashboardController.getDashboardStats';
import getCompanies from '@salesforce/apex/DashboardController.getCompanies';
import getSignals from '@salesforce/apex/DashboardController.getSignals';
import updateCompany from '@salesforce/apex/DashboardController.updateCompany';
import deleteCompany from '@salesforce/apex/DashboardController.deleteCompany';
// Sharing Imports
import getTeammates from '@salesforce/apex/DashboardController.getTeammates';
import shareCompanies from '@salesforce/apex/DashboardController.shareCompanies';
import getSharedUsers from '@salesforce/apex/DashboardController.getSharedUsers';
import unshareCompany from '@salesforce/apex/DashboardController.unshareCompany';

export default class Dashboard extends NavigationMixin(LightningElement) {
    @track stats = { totalCompanies: 0, processing: 0, completed: 0, opened: 0 };
    @track _companies = [];
    @track _companySignals = {};
    @track searchTerm = '';
    @track companyFilter = 'all';
    @track dateFilter = '';
    @track currentPage = 1;
    ITEMS_PER_PAGE = 10;

    // --- Sharing State ---
    @track selectedCompanyIds = new Set();
    @track shareTargetUserId = '';
    @track isSharing = false;
    @track shareMessage = null; // Custom toast object: { text: '', type: 'success'|'error' }
    
    // --- Unshare Modal State ---
    @track isUnshareModalOpen = false;
    @track currentUnshareCompanyId = '';
    @track currentUnshareCompanyName = '';
    @track sharedWithUsersList = [];

    // Fetch teammates (users in same profile)
    @wire(getTeammates)
    teammates;

    connectedCallback() {
        this.loadStats();
        this.loadCompanies();
    }

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
                this._companies.forEach(c => this.loadSignalsForCompany(c.companyId));
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

    // Single consolidated mapCompany method
    mapCompany(c, signals) {
        const companySignals = signals || this._companySignals[c.companyId] || [];
        const signalSummary = this.getSignalSummary(companySignals, c.status);
        
        return {
            ...c,
            locationDisplay: [c.city, c.state].filter(Boolean).join(', '),
            createdAtDisplay: c.createdAt
                ? new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                : '-',
            statusClass: this.getStatusClass(c.status),
            statusLabel: c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Unknown',
            
            // --- Sharing UI Logic ---
            isSelected: this.selectedCompanyIds.has(c.companyId),
            hasSharedLabel: !!c.sharedByName, 
            sharedByLabel: `Shared by ${c.sharedByName}`,
            // Show Unshare if shared with others AND we own it (no sharedByName)
            showUnshareButton: c.isShared && !c.sharedByName,
            // Show Share only if completed, not shared yet, and we own it
            showShareButton: !c.isShared && !c.sharedByName && c.status === 'completed',
            
            stageIsPreCall:        (c.stage || 'PreCall') === 'PreCall',
            stageIsAppointmentSet: c.stage === 'Appointment Set',
            stageIsFaceToFace:     c.stage === 'Face To Face',
            stageIsQualification:  c.stage === 'Qualification',
            clientTypeIsProspect:  (c.clientType || 'Prospect') === 'Prospect',
            clientTypeIsExisting:  c.clientType === 'Existing Customer',
            clientTypeIsPast:      c.clientType === 'Past Customer',
            hasSignals:            signalSummary !== null,
            signalBadgeLabel:      signalSummary
                                        ? (signalSummary.warningCount > 0
                                            ? `${signalSummary.count} (${signalSummary.warningCount})`
                                            : `${signalSummary.count}`)
                                        : 'Signals',
            signalBadgeClass:      'signal-badge ' + (signalSummary ? this.getSignalBadgeClass(signalSummary.maxPriority) : 'signal-default')
        };
    }

    // --- Selection Handlers ---

    handleRowSelect(event) {
    event.stopPropagation(); // Double protection
    // Use 'companyid' (all lowercase) to match the HTML data-companyid
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
                // Only select rows we are allowed to share (Owner + Completed)
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
        // Force refresh mapping to update 'isSelected' reactive state
        this._companies = this._companies.map(c => ({
            ...c,
            isSelected: this.selectedCompanyIds.has(c.companyId)
        }));
        // Logic to trigger re-render of the 'Select All' checkbox if needed
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
            this.loadCompanies(); // Refresh the list
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

    // --- Unsharing Logic ---
    // 1. Add this method to prevent the row click from firing when clicking the checkbox
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
                // Refresh local list of users in modal
                this.sharedWithUsersList = this.sharedWithUsersList.filter(u => u.id !== sharedRecordId);
                if (this.sharedWithUsersList.length === 0) {
                    this.handleCloseUnshareModal();
                }
                this.loadCompanies(); 
            })
            .catch(error => {
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

    // --- Getters for UI visibility ---
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

    // --- Existing Helper Logic ---

    getSignalSummary(signals, status) {
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

    // --- Stats & Pagination Getters ---
    get totalCompanies() { return this.stats.totalCompanies || 0; }
    get processing()     { return this.stats.processing || 0; }
    get completed()      { return this.stats.completed || 0; }
    get opened()         { return this.stats.opened || 0; }

    get filterOptions() {
        return [
            { label: 'All',                  value: 'all' },
            { label: 'Most Recent 2',        value: 'recent2' },
            { label: 'Client: Prospect',     value: 'clientType:Prospect' },
            { label: 'Client: Existing',     value: 'clientType:Existing Customer' },
            { label: 'Client: Past',         value: 'clientType:Past Customer' },
            { label: 'Stage: PreCall',       value: 'stage:PreCall' },
            { label: 'Stage: Appt Set',      value: 'stage:Appointment Set' },
            { label: 'Stage: Face To Face',  value: 'stage:Face To Face' },
            { label: 'Stage: Qualification', value: 'stage:Qualification' },
            { label: 'Status: Completed',    value: 'status:completed' },
            { label: 'Status: Processing',   value: 'status:processing' },
            { label: 'Status: Pending',      value: 'status:pending' },
            { label: 'Status: Failed',       value: 'status:failed' },
            { label: 'By Date Submitted',    value: 'byDate' }
        ];
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

    // --- Standard Handlers ---
    handleSearchChange(event)     { this.searchTerm = event.target.value; this.currentPage = 1; }
    handleClearSearch()           { this.searchTerm = ''; this.currentPage = 1; }
    handleFilterChange(event)     { this.companyFilter = event.target.value; if (this.companyFilter !== 'byDate') this.dateFilter = ''; this.currentPage = 1; }
    handleDateFilterChange(event) { this.dateFilter = event.target.value; this.currentPage = 1; }
    handleClearFilter()           { this.companyFilter = 'all'; this.dateFilter = ''; this.searchTerm = ''; this.currentPage = 1; }
    handlePrevPage()              { if (this.currentPage > 1) this.currentPage--; }
    handleNextPage()              { if (this.currentPage < this.totalPages) this.currentPage++; }

    handleStageChange(event) {
        const companyId = event.target.dataset.companyid;
        const newStage = event.target.value;
        this._companies = this._companies.map(c => c.companyId === companyId ? this.mapCompany({ ...c, stage: newStage }) : c);
        updateCompany({ companyId, stage: newStage, clientType: null }).catch(err => console.error(err));
    }

    handleClientTypeChange(event) {
        const companyId = event.target.dataset.companyid;
        const newClientType = event.target.value;
        this._companies = this._companies.map(c => c.companyId === companyId ? this.mapCompany({ ...c, clientType: newClientType }) : c);
        updateCompany({ companyId, stage: null, clientType: newClientType }).catch(err => console.error(err));
    }

    handleOpenSignals(event) {
        const companyId = event.currentTarget.dataset.companyid;
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Company_Detail' },
            state: { c__companyId: companyId, c__tab: 'signals' }
        });
    }

    handleDelete(event) {
        const companyId = event.currentTarget.dataset.companyid;
        const company = this._companies.find(c => c.companyId === companyId);
        if (!company) return;
        this._companies = this._companies.filter(c => c.companyId !== companyId);
        deleteCompany({ companyId }).catch(error => {
            console.error(error);
            this._companies = [...this._companies, company];
        });
    }

    handleCompanyClick(event) {
        // Look for the ID on the currentTarget (the row)
        const companyId = event.currentTarget.dataset.companyid; 
        
        if (!companyId) return; // Prevent navigation if ID is missing

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
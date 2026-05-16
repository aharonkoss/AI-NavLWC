import { LightningElement, track } from 'lwc';
import getAllCompanies from '@salesforce/apex/AllCompaniesController.getAllCompanies';

export default class AllCompanies extends LightningElement {
    @track companies = [];
    @track isLoading = true;
    @track error = null;
    @track searchTerm = '';
    @track filter = 'all'; // all | clientType:Prospect | stage:PreCall | status:completed | etc.

    connectedCallback() {
        this.loadCompanies();
    }

    loadCompanies() {
        this.isLoading = true;
        this.error = null;
        getAllCompanies()
            .then(result => {
                const raw = JSON.parse(result);
                this.companies = raw.map(c => this.mapCompany(c));
                this.isLoading = false;
            })
            .catch(err => {
                console.error('Error loading companies', err);
                this.error = err.body?.message || 'Failed to load companies.';
                this.isLoading = false;
            });
    }

    mapCompany(c) {
        return {
            ...c,
            locationDisplay: [c.city, c.state].filter(Boolean).join(', '),
            createdAtDisplay: c.createdAt
                ? new Date(c.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit'
                  })
                : '-',
            clientTypeLabel: c.clientType || 'Prospect',
            stageLabel: c.stage || 'PreCall',
            statusLabel: c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Unknown',
            statusClass: this.getStatusClass(c.status)
        };
    }

    getStatusClass(status) {
        const map = {
            completed:  'ac-status-pill ac-status-completed',
            processing: 'ac-status-pill ac-status-processing',
            pending:    'ac-status-pill ac-status-pending',
            failed:     'ac-status-pill ac-status-failed'
        };
        return map[status] || 'ac-status-pill ac-status-pending';
    }

    // Filters and search
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    handleClearSearch() {
        this.searchTerm = '';
    }

    handleFilterChange(event) {
        this.filter = event.target.value;
    }

    get filterOptions() {
        return [
            { label: 'All', value: 'all' },
            { label: 'Client: Prospect', value: 'clientType:Prospect' },
            { label: 'Client: Existing', value: 'clientType:Existing Customer' },
            { label: 'Client: Past',     value: 'clientType:Past Customer' },
            { label: 'Stage: PreCall',   value: 'stage:PreCall' },
            { label: 'Stage: Appt Set',  value: 'stage:Appointment Set' },
            { label: 'Stage: Face To Face', value: 'stage:Face To Face' },
            { label: 'Stage: Qualification', value: 'stage:Qualification' },
            { label: 'Status: Completed', value: 'status:completed' },
            { label: 'Status: Processing', value: 'status:processing' },
            { label: 'Status: Pending', value: 'status:pending' },
            { label: 'Status: Failed', value: 'status:failed' }
        ];
    }

    get filteredCompanies() {
        let list = [...this.companies];

        // filter
        if (this.filter.startsWith('clientType:')) {
            const val = this.filter.replace('clientType:', '');
            list = list.filter(c => c.clientType === val);
        } else if (this.filter.startsWith('stage:')) {
            const val = this.filter.replace('stage:', '');
            list = list.filter(c => c.stage === val);
        } else if (this.filter.startsWith('status:')) {
            const val = this.filter.replace('status:', '');
            list = list.filter(c => c.status === val);
        }

        // search
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(c =>
                c.name?.toLowerCase().includes(term) ||
                c.city?.toLowerCase().includes(term) ||
                c.state?.toLowerCase().includes(term) ||
                c.website?.toLowerCase().includes(term)
            );
        }

        // sort alphabetically by name
        return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    get hasCompanies() {
        return this.filteredCompanies.length > 0;
    }

    get emptyMessage() {
        if (this.searchTerm) return `No companies found matching "${this.searchTerm}"`;
        if (this.filter !== 'all') return 'No companies match this filter.';
        return 'No companies yet.';
    }
}
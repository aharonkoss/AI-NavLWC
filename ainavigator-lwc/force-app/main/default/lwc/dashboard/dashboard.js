import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex Picklist & Metadata Config Imports
import getStageOptions from '@salesforce/apex/DashboardController.getStageOptions';
import getClientTypeOptions from '@salesforce/apex/DashboardController.getClientTypeOptions';
import getProspectFilterConfigs from '@salesforce/apex/DashboardController.getProspectFilterConfigs';

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

// Prospect Discovery Apex Imports
import startProspectDiscovery from '@salesforce/apex/DashboardController.startProspectDiscovery';
import getProspectDiscoveryStatus from '@salesforce/apex/DashboardController.getProspectDiscoveryStatus';
import addProspectCompany from '@salesforce/apex/DashboardController.addProspectCompany';

const POLLING_INTERVAL_MS = 5000;
const PROSPECT_POLLING_INTERVAL_MS = 15000;

export default class Dashboard extends NavigationMixin(LightningElement) {
    // Current Active Tab: 'companies' | 'prospects'
    @track activeTab = 'companies';

    // =========================================================================
    // Tab 1: Companies State
    // =========================================================================
    @track stats = { totalCompanies: 0, processing: 0, completed: 0, opened: 0 };
    @track _companies = [];
    @track _companySignals = {};
    @track searchTerm = '';
    @track companyFilter = 'all';
    @track dateFilter = '';
    @track currentPage = 1;
    ITEMS_PER_PAGE = 10;

    // Picklists
    @track stageOptions = [];
    @track clientTypeOptions = [];

    // Sharing State
    @track selectedCompanyIds = new Set();
    @track shareTargetUserId = '';
    @track isSharing = false;
    @track shareMessage = null;
    
    // Unshare Modal
    @track isUnshareModalOpen = false;
    @track currentUnshareCompanyId = '';
    @track currentUnshareCompanyName = '';
    @track sharedWithUsersList = [];
    
    // Delete Modal
    @track isDeleteModalOpen = false;
    @track companyToDeleteId = '';
    @track companyToDeleteName = '';

    // Polling
    pollingIntervalId = null;
    isPollingActive = false;

    // =========================================================================
    // Tab 2: Prospect Discovery State & Dynamic Filters (from Custom Metadata)
    // =========================================================================
    @track isProspectSearching = false;
    @track showProspectFilters = false;
    @track prospectLastUpdated = '';
    prospectPollingIntervalId = null;
    isProspectPollingActive = false;

    // Dropdown open states
    @track isRevenueMenuOpen = false;
    @track isEmployeesMenuOpen = false;
    @track isAgeMenuOpen = false;
    @track isStatesMenuOpen = false;
    @track isIndustriesMenuOpen = false;

    // "Do Not Call" Filter (Dropdown: Yes / No)
    @track doNotCallValue = 'No';

    // Filter Options dynamically loaded from AI_Navigator_Prospect_Filter_Option__mdt
    @track revenueOptions = [];
    @track employeeOptions = [];
    @track ageOptions = [];
    @track stateOptions = [];
    @track industryOptions = [];
    @track opportunitySignalChips = [];

    // Location Targeting Custom Pills
    @track locationType = 'City';
    @track locationInputText = '';
    @track locationPills = [];

    // Industry Targeting Custom Pills
    @track industryInputText = '';
    @track industryPills = [];

    // Live Prospects & Insights
    @track prospects = [];
    @track marketInsights = {
        trends: '',
        competition: '',
        timing: ''
    };
    @track industriesToWatch = [];

    @wire(getTeammates)
    teammates;

    connectedCallback() {
        this.loadStats();
        this.loadPicklistOptions();
        this.loadProspectFilterConfigs();
        window.addEventListener('companysubmitted', this.handleCompanySubmitted);
    }

    disconnectedCallback() {
        window.removeEventListener('companysubmitted', this.handleCompanySubmitted);
        this.stopPolling();
        this.stopProspectPolling();
    }

    // =========================================================================
    // Dynamic Filter Configs from AI_Navigator_Prospect_Filter_Option__mdt
    // =========================================================================
    loadProspectFilterConfigs() {
        getProspectFilterConfigs()
            .then(resultJson => {
                const grouped = JSON.parse(resultJson);
                if (grouped.Revenue && grouped.Revenue.length > 0) {
                    this.revenueOptions = grouped.Revenue.map(o => ({ id: o.id, label: o.label, checked: false }));
                }
                if (grouped.Employees && grouped.Employees.length > 0) {
                    this.employeeOptions = grouped.Employees.map(o => ({ id: o.id, label: o.label, checked: false }));
                }
                if (grouped.Company_Age && grouped.Company_Age.length > 0) {
                    this.ageOptions = grouped.Company_Age.map(o => ({ id: o.id, label: o.label, checked: false }));
                }
                if (grouped.State && grouped.State.length > 0) {
                    this.stateOptions = grouped.State.map(o => ({ id: o.id, label: o.label, checked: false }));
                }
                if (grouped.Industry && grouped.Industry.length > 0) {
                    this.industryOptions = grouped.Industry.map(o => ({ id: o.id, label: o.label, checked: false }));
                }
                if (grouped.Signal && grouped.Signal.length > 0) {
                    this.opportunitySignalChips = grouped.Signal.map(o => ({
                        id: o.id,
                        label: o.label,
                        active: false,
                        classes: 'chip-btn'
                    }));
                }
            })
            .catch(error => {
                console.error('[Dashboard Log] Error loading custom metadata filter configs:', error);
            });
    }

    // =========================================================================
    // Tab Navigation & Auto-Fetch on Tab Selection
    // =========================================================================
    get isCompaniesTab() {
        return this.activeTab === 'companies';
    }

    get isProspectTab() {
        return this.activeTab === 'prospects';
    }

    get companiesTabClass() {
        return `tab-btn ${this.isCompaniesTab ? 'active' : 'inactive'}`;
    }

    get prospectsTabClass() {
        return `tab-btn ${this.isProspectTab ? 'active' : 'inactive'}`;
    }

    handleTabChange(event) {
        this.activeTab = event.currentTarget.dataset.tab;
        if (this.activeTab === 'prospects') {
            this.fetchProspectStatusOnTabLoad();
        }
    }

    fetchProspectStatusOnTabLoad() {
        if (this.isProspectPollingActive) {
            return;
        }

        this.isProspectSearching = true;

        getProspectDiscoveryStatus()
            .then(resultJson => {
                const data = JSON.parse(resultJson);
                console.log('[Dashboard Log] Tab change prospect status:', data);

                if (data.status === 'completed' || data.success === true) {
                    this.isProspectSearching = false;
                    this.prospectLastUpdated = new Date().toLocaleString('en-US', {
                        month: 'numeric', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
                    });
                    if (data.recommendations) {
                        this.processProspectRecommendations(data.recommendations);
                    } else {
                        this.prospects = [];
                    }
                } else if (data.status === 'processing') {
                    this.isProspectSearching = true;
                    this.startProspectPolling();
                } else {
                    this.isProspectSearching = false;
                    this.prospects = [];
                }
            })
            .catch(error => {
                console.error('[Dashboard Log] Error fetching prospect status on tab change:', error);
                this.isProspectSearching = false;
            });
    }

    // =========================================================================
    // Tab 2: Prospect Discovery & Filter Actions
    // =========================================================================
    get prospectsCount() {
        return this.prospects ? this.prospects.length : 0;
    }

    get hasProspects() {
        return this.prospects && this.prospects.length > 0;
    }

    get hasMarketInsights() {
        return this.marketInsights && (this.marketInsights.trends || this.marketInsights.competition || this.marketInsights.timing);
    }

    get hasIndustriesToWatch() {
        return this.industriesToWatch && this.industriesToWatch.length > 0;
    }

    get doNotCallOptions() {
        return [
            { label: 'No', value: 'No' },
            { label: 'Yes', value: 'Yes' }
        ];
    }

    handleDoNotCallChange(event) {
        this.doNotCallValue = event.target.value;
    }

    get revenueLabel() {
        const checked = this.revenueOptions.filter(o => o.checked);
        if (checked.length === 0) return 'Based on Portfolio';
        return `${checked.length} Selected`;
    }

    get employeesLabel() {
        const checked = this.employeeOptions.filter(o => o.checked);
        if (checked.length === 0) return 'Based on Portfolio';
        return `${checked.length} Selected`;
    }

    get ageLabel() {
        const checked = this.ageOptions.filter(o => o.checked);
        if (checked.length === 0) return 'Any Age';
        return `${checked.length} Selected`;
    }

    get statesLabel() {
        const checked = this.stateOptions.filter(o => o.checked);
        if (checked.length === 0) return 'Based on Portfolio';
        if (checked.length <= 2) return checked.map(o => o.label).join(', ');
        return `${checked.length} Selected`;
    }

    get industriesLabel() {
        const checked = this.industryOptions.filter(o => o.checked);
        if (checked.length === 0) return 'Based on Portfolio';
        if (checked.length <= 2) return checked.map(o => o.label).join(', ');
        return `${checked.length} Selected`;
    }

    get hasLocationPills() {
        return this.locationPills && this.locationPills.length > 0;
    }

    get hasIndustryPills() {
        return this.industryPills && this.industryPills.length > 0;
    }

    handleToggleFilters() {
        this.showProspectFilters = !this.showProspectFilters;
        this.closeMenus();
    }

    handleResetFilters() {
        this.revenueOptions = this.revenueOptions.map(o => ({ ...o, checked: false }));
        this.employeeOptions = this.employeeOptions.map(o => ({ ...o, checked: false }));
        this.ageOptions = this.ageOptions.map(o => ({ ...o, checked: false }));
        this.stateOptions = this.stateOptions.map(o => ({ ...o, checked: false }));
        this.industryOptions = this.industryOptions.map(o => ({ ...o, checked: false }));
        this.doNotCallValue = 'No';
        this.locationPills = [];
        this.locationInputText = '';
        this.industryPills = [];
        this.industryInputText = '';
        this.opportunitySignalChips = this.opportunitySignalChips.map(c => ({
            ...c,
            active: false,
            classes: 'chip-btn'
        }));
    }

    toggleRevenueMenu(e) { e.stopPropagation(); this.isRevenueMenuOpen = !this.isRevenueMenuOpen; this.isEmployeesMenuOpen = false; this.isAgeMenuOpen = false; this.isStatesMenuOpen = false; this.isIndustriesMenuOpen = false; }
    toggleEmployeesMenu(e) { e.stopPropagation(); this.isEmployeesMenuOpen = !this.isEmployeesMenuOpen; this.isRevenueMenuOpen = false; this.isAgeMenuOpen = false; this.isStatesMenuOpen = false; this.isIndustriesMenuOpen = false; }
    toggleAgeMenu(e) { e.stopPropagation(); this.isAgeMenuOpen = !this.isAgeMenuOpen; this.isRevenueMenuOpen = false; this.isEmployeesMenuOpen = false; this.isStatesMenuOpen = false; this.isIndustriesMenuOpen = false; }
    toggleStatesMenu(e) { e.stopPropagation(); this.isStatesMenuOpen = !this.isStatesMenuOpen; this.isRevenueMenuOpen = false; this.isEmployeesMenuOpen = false; this.isAgeMenuOpen = false; this.isIndustriesMenuOpen = false; }
    toggleIndustriesMenu(e) { e.stopPropagation(); this.isIndustriesMenuOpen = !this.isIndustriesMenuOpen; this.isRevenueMenuOpen = false; this.isEmployeesMenuOpen = false; this.isAgeMenuOpen = false; this.isStatesMenuOpen = false; }

    closeMenus() {
        this.isRevenueMenuOpen = false;
        this.isEmployeesMenuOpen = false;
        this.isAgeMenuOpen = false;
        this.isStatesMenuOpen = false;
        this.isIndustriesMenuOpen = false;
    }

    handleRevenueChange(e) {
        const id = e.target.dataset.id;
        this.revenueOptions = this.revenueOptions.map(o => o.id === id ? { ...o, checked: e.target.checked } : o);
    }

    handleEmployeeChange(e) {
        const id = e.target.dataset.id;
        this.employeeOptions = this.employeeOptions.map(o => o.id === id ? { ...o, checked: e.target.checked } : o);
    }

    handleAgeChange(e) {
        const id = e.target.dataset.id;
        this.ageOptions = this.ageOptions.map(o => o.id === id ? { ...o, checked: e.target.checked } : o);
    }

    handleStateOptionChange(e) {
        const id = e.target.dataset.id;
        this.stateOptions = this.stateOptions.map(o => o.id === id ? { ...o, checked: e.target.checked } : o);
    }

    handleIndustryOptionChange(e) {
        const id = e.target.dataset.id;
        this.industryOptions = this.industryOptions.map(o => o.id === id ? { ...o, checked: e.target.checked } : o);
    }

    handleLocationTypeChange(e) {
        this.locationType = e.target.value;
    }

    handleLocationInputChange(e) {
        this.locationInputText = e.target.value;
    }

    handleAddLocation() {
        if (!this.locationInputText || !this.locationInputText.trim()) return;
        const textVal = this.locationInputText.trim();
        const typeVal = this.locationType.toLowerCase();

        const newPill = {
            id: 'loc-' + Date.now(),
            label: `${textVal} (${typeVal})`,
            type: typeVal,
            value: textVal
        };

        if (typeVal === 'radius') {
            newPill.radiusMiles = 25;
        }

        this.locationPills = [...this.locationPills, newPill];
        this.locationInputText = '';
    }

    handleRemoveLocationPill(e) {
        const pillId = e.currentTarget.dataset.id;
        this.locationPills = this.locationPills.filter(p => p.id !== pillId);
    }

    handleIndustryInputChange(e) {
        this.industryInputText = e.target.value;
    }

    handleAddIndustry() {
        if (!this.industryInputText || !this.industryInputText.trim()) return;
        const val = this.industryInputText.trim();
        const isNaics = /^\d+$/.test(val);

        const newPill = {
            id: 'ind-' + Date.now(),
            label: val,
            type: isNaics ? 'naics' : 'custom',
            value: val
        };

        this.industryPills = [...this.industryPills, newPill];
        this.industryInputText = '';
    }

    handleRemoveIndustryPill(e) {
        const pillId = e.currentTarget.dataset.id;
        this.industryPills = this.industryPills.filter(p => p.id !== pillId);
    }

    handleToggleSignalChip(e) {
        const id = e.currentTarget.dataset.id;
        this.opportunitySignalChips = this.opportunitySignalChips.map(c => {
            if (c.id === id) {
                const active = !c.active;
                return { ...c, active, classes: `chip-btn ${active ? 'chip-active' : ''}` };
            }
            return c;
        });
    }

    // -------------------------------------------------------------------------
    // Prospect Discovery Search & Polling
    // -------------------------------------------------------------------------
    buildFiltersPayload() {
        const revenueRanges = this.revenueOptions.filter(o => o.checked).map(o => o.id);
        const employeeRanges = this.employeeOptions.filter(o => o.checked).map(o => o.id);
        const companyAges = this.ageOptions.filter(o => o.checked).map(o => o.id);

        const locations = [
            ...this.stateOptions.filter(s => s.checked).map(s => ({ type: 'state', value: s.id })),
            ...this.locationPills.map(p => {
                const loc = { type: p.type || 'city', value: p.value || p.label };
                if (p.type === 'radius' && p.radiusMiles) {
                    loc.radiusMiles = p.radiusMiles;
                }
                return loc;
            })
        ];

        const industries = [
            ...this.industryOptions.filter(i => i.checked).map(i => ({ type: 'custom', value: i.label })),
            ...this.industryPills.map(p => ({
                type: p.type || (/^\d+$/.test(p.value) ? 'naics' : 'custom'),
                value: p.value || p.label
            }))
        ];

        const signals = this.opportunitySignalChips.filter(c => c.active).map(c => c.id);

        return {
            revenueRanges,
            employeeRanges,
            companyAges,
            locations,
            industries,
            signals,
            doNotCall: this.doNotCallValue === 'Yes'
        };
    }

    handleSearch() {
        this.isProspectSearching = true;
        this.showProspectFilters = false;
        this.closeMenus();

        const filters = this.buildFiltersPayload();

        startProspectDiscovery({ filtersJson: JSON.stringify(filters) })
            .then(resultJson => {
                console.log('[Dashboard Log] Prospect discovery initiated:', resultJson);
                this.startProspectPolling();
            })
            .catch(error => {
                console.error('[Dashboard Log] Error starting prospect discovery:', error);
                this.isProspectSearching = false;
                const errorMsg = error?.body?.message || error?.message || 'Server error';
                this.showCustomToast('Failed to start prospect search: ' + errorMsg, 'error');
            });
    }

    handleSearchAgain() {
        this.handleSearch();
    }

    startProspectPolling() {
        this.stopProspectPolling();
        this.pollProspectStatus();
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.prospectPollingIntervalId = setInterval(() => {
            this.pollProspectStatus();
        }, PROSPECT_POLLING_INTERVAL_MS);
    }

    stopProspectPolling() {
        if (this.prospectPollingIntervalId) {
            clearInterval(this.prospectPollingIntervalId);
            this.prospectPollingIntervalId = null;
        }
    }

    pollProspectStatus() {
        if (this.isProspectPollingActive) return;
        this.isProspectPollingActive = true;

        getProspectDiscoveryStatus()
            .then(resultJson => {
                const data = JSON.parse(resultJson);
                console.log('[Dashboard Log] Prospect status response:', data);

                if (data.status === 'completed' || data.success === true) {
                    this.stopProspectPolling();
                    this.isProspectSearching = false;
                    this.prospectLastUpdated = new Date().toLocaleString('en-US', {
                        month: 'numeric', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
                    });

                    if (data.recommendations) {
                        this.processProspectRecommendations(data.recommendations);
                    }
                    this.showCustomToast('Prospect Discovery completed with fresh AI matches', 'success');
                } else if (data.status === 'failed') {
                    this.stopProspectPolling();
                    this.isProspectSearching = false;
                    this.showCustomToast(
                        'Prospect discovery failed: ' + (data.message || 'Error executing search.'),
                        'error'
                    );
                }
            })
            .catch(error => {
                console.error('[Dashboard Log] Error polling prospect status:', error);
            })
            .finally(() => {
                this.isProspectPollingActive = false;
            });
    }

    processProspectRecommendations(recs) {
        if (!recs) return;

        const rawProspects = recs.newProspects || recs.prospects || [];
        if (Array.isArray(rawProspects)) {
            this.prospects = rawProspects.map((lead, idx) => {
                const priority = (lead.priority || 'MEDIUM').toUpperCase();
                let priorityLabel = 'Good Match';
                let priorityBadgeClass = 'priority-chip chip-good';
                let cardClass = 'lead-card border-good';

                if (priority === 'CRITICAL' || priority === 'HIGH') {
                    priorityLabel = 'High Priority';
                    priorityBadgeClass = 'priority-chip chip-high';
                    cardClass = 'lead-card border-high';
                } else if (priority === 'MEDIUM' || priority === 'STRONG') {
                    priorityLabel = 'Strong Match';
                    priorityBadgeClass = 'priority-chip chip-strong';
                    cardClass = 'lead-card border-strong';
                }

                let city = '';
                let state = '';
                if (lead.location) {
                    const parts = lead.location.split(',');
                    if (parts.length >= 2) {
                        city = parts[0].trim();
                        state = parts[1].trim();
                    } else {
                        city = lead.location.trim();
                    }
                }

                return {
                    id: 'prospect-' + idx + '-' + Date.now(),
                    name: lead.companyName || 'Unknown Company',
                    website: lead.website || lead.sourceUrl || '',
                    location: lead.location || '',
                    city: city,
                    state: state,
                    industry: lead.industry || '',
                    revenue: lead.estimatedRevenue || '',
                    employees: lead.employeeCount || '',
                    opportunity: lead.bankingNeedSignal || lead.opportunity || '',
                    recentActivity: lead.recentActivity || '',
                    sourceUrl: lead.sourceUrl || lead.website || '',
                    priorityLabel: priorityLabel,
                    priorityBadgeClass: priorityBadgeClass,
                    cardClass: cardClass,
                    suggestedApproach: lead.recommendedApproach || lead.suggestedApproach || '',
                    isSubmitting: false,
                    isDuplicate: false,
                    duplicateMessage: null
                };
            });
        }

        const rawInsights = recs.searchInsights || recs.marketInsights;
        if (rawInsights) {
            this.marketInsights = {
                trends: rawInsights.marketTrends || rawInsights.trends || '',
                competition: rawInsights.competitiveAnalysis || rawInsights.competition || '',
                timing: rawInsights.timingRecommendation || rawInsights.timing || ''
            };
        }

        const rawIndustries = recs.topIndustriesToWatch || recs.industriesToWatch;
        if (Array.isArray(rawIndustries)) {
            this.industriesToWatch = rawIndustries.map(ind => ({
                title: ind.industry || ind.title || '',
                description: ind.reason || ind.description || '',
                subDescription: ind.growthRate || ind.subDescription || ''
            }));
        }
    }

    handleViewSource(event) {
        event.stopPropagation();
        event.preventDefault();
        const leadId = event.currentTarget.dataset.id;
        const lead = this.prospects.find(p => p.id === leadId);
        const targetUrl = lead?.sourceUrl || lead?.website || 'https://www.google.com';
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }

    // Submits prospect, switches to Companies tab, and initiates live polling with duplicate check
    handleAddProspectToList(e) {
        const prospectId = e.currentTarget.dataset.id;
        const prospect = this.prospects.find(p => p.id === prospectId);
        if (!prospect || prospect.isSubmitting || prospect.isDuplicate) return;

        this.prospects = this.prospects.map(p => 
            p.id === prospectId ? { ...p, isSubmitting: true } : p
        );

        let city = prospect.city;
        let state = prospect.state;
        if ((!city || !state) && prospect.location) {
            const parts = prospect.location.split(',');
            if (parts.length >= 2) {
                city = parts[0].trim();
                state = parts[1].trim();
            } else {
                city = prospect.location.trim();
            }
        }

        const companyWebsite = prospect.website 
            ? prospect.website.trim() 
            : `https://${prospect.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

        addProspectCompany({
            name    : prospect.name.trim(),
            website : companyWebsite,
            city    : city,
            state   : state
        })
        .then(resultJson => {
            const result = JSON.parse(resultJson);

            // A. Remove lead from prospect discovery list
            this.prospects = this.prospects.filter(p => p.id !== prospectId);

            // B. Add new company to local state with pulsing processing dot
            const newCompany = this.mapCompany({
                companyId      : result.companyId,
                azureCompanyId : result.azureCompanyId,
                correlationId  : result.correlationId,
                name           : result.name,
                city           : result.city,
                state          : result.state,
                stage          : result.stage || 'PreCall',
                clientType     : result.clientType || 'Prospect',
                status         : (result.status || 'processing').toLowerCase(),
                currentStage   : 'submitted',
                createdAt      : result.createdAt || new Date().toISOString()
            });

            const index = this._companies.findIndex(c => c.companyId === newCompany.companyId);
            if (index !== -1) {
                this._companies[index] = newCompany;
            } else {
                this._companies = [newCompany, ...this._companies];
            }
            this._companies = [...this._companies];

            // C. Automatically switch to the Companies tab
            this.activeTab = 'companies';

            // D. Start live polling for status progression
            this.startPolling();

            // E. Refresh database and stats
            this.loadStats();

            this.showCustomToast(
                `${result.name} added to your list and submitted for research.`,
                'success'
            );
        })
        .catch(error => {
            console.error('[Dashboard Log] Error adding prospect to list:', error);
            const rawMessage = error?.body?.message || error?.message || 'Unable to add company.';
            
            // Exact requirement: “This company has already been submitted by [User Name].”
            const isDuplicate = rawMessage.toLowerCase().includes('already been submitted');
            const displayMessage = isDuplicate ? rawMessage : `Failed to add company: ${rawMessage}`;

            // Update prospect card state to show duplicate banner and disable the button
            this.prospects = this.prospects.map(p => 
                p.id === prospectId 
                    ? { 
                        ...p, 
                        isSubmitting: false, 
                        isDuplicate: isDuplicate, 
                        duplicateMessage: isDuplicate ? rawMessage : null 
                      } 
                    : p
            );

            this.showCustomToast(displayMessage, 'error');
        });
    }

    handleRemoveProspect(e) {
        const prospectId = e.currentTarget.dataset.id;
        this.prospects = this.prospects.filter(p => p.id !== prospectId);
    }

    // =========================================================================
    // Tab 1: Companies Lifecycle & Apex Polling
    // =========================================================================
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
            companyId      : payload.companyId,
            azureCompanyId : payload.azureCompanyId,
            correlationId  : payload.correlationId,
            name           : payload.name,
            city           : payload.city,
            state          : payload.state,
            stage          : payload.stage,
            clientType     : payload.clientType,
            status         : payload.status || 'pending',
            currentStage   : payload.currentStage || 'submitted',
            createdAt      : payload.createdAt || new Date().toISOString()
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

    mapCompany(c, signals) {
        const displayStatus = c.status || 'pending';
        const isCompleted = displayStatus === 'completed';

        const currentStage = c.stage || (this.stageOptions.length > 0 ? this.stageOptions[0].value : '');
        const currentClientType = c.clientType || (this.clientTypeOptions.length > 0 ? this.clientTypeOptions[0].value : '');

        const companySignals = signals || this._companySignals[c.companyId] || [];
        const signalSummary = this.getSignalSummary(companySignals);

        const statusLabel = displayStatus ? displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1) : 'Unknown';
        
        let statusDisplay = displayStatus;
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
            
            stageOptions: this.stageOptions.map(opt => ({
                ...opt,
                isSelected: opt.value === currentStage
            })),
            clientTypeOptions: this.clientTypeOptions.map(opt => ({
                ...opt,
                isSelected: opt.value === currentClientType
            })),

            isSelected: this.selectedCompanyIds.has(c.companyId),
            hasSharedLabel: !!c.sharedByName, 
            sharedByLabel: `Shared by ${c.sharedByName}`,
            showUnshareButton: c.isShared && !c.sharedByName,
            showShareButton: !c.isShared && !c.sharedByName && displayStatus === 'completed',
            
            hasSignals: signalSummary !== null,
            signalCount: signalSummary ? signalSummary.count : 0,
            hasAlert: signalSummary ? signalSummary.warningCount > 0 : false,
            alertText: signalSummary && signalSummary.warningCount > 0 ? `(${signalSummary.warningCount}!)` : '',
            signalBadgeClass: 'signal-badge ' + (signalSummary ? this.getSignalBadgeClass(signalSummary.maxPriority, signalSummary.warningCount) : 'signal-blue')
        };
    }

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

    get isAllSelected() {
        const eligible = this.paginatedCompanies.filter(c => c.status === 'completed' && !c.sharedByName);
        return eligible.length > 0 && eligible.every(c => this.selectedCompanyIds.has(c.companyId));
    }

    get isToolbarCheckboxChecked() {
        return this.isAllSelected;
    }

    get showShareToolbar() {
        return this.selectedCompanyIds.size > 0;
    }

    get selectionBarLabel() {
        return this.selectedCompanyIds.size > 0 
            ? `${this.selectedCompanyIds.size} selected` 
            : 'Select all';
    }

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
        }, 5000);
    }

    get toastClass() {
        return this.shareMessage 
            ? `custom-toast toast-${this.shareMessage.type}` 
            : 'custom-toast';
    }

    get isShareDisabled() {
        return !this.shareTargetUserId || this.isSharing;
    }

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

    getSignalBadgeClass(priority, warningCount) {
        if (warningCount > 0) return 'signal-yellow';
        if (priority >= 4) return 'signal-red';
        return 'signal-blue';
    }

    getStatusClass(status) {
        const map = {
            completed:  'status-pill status-completed',
            processing: 'status-pill status-processing',
            pending:    'status-pill status-processing',
            failed:     'status-pill status-failed'
        };
        return map[status] || 'status-pill status-processing';
    }

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
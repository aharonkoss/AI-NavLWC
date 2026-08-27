import { LightningElement, api, track, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import NAME_FIELD from '@salesforce/schema/User.Name';
import AI_NAV_LOGO from '@salesforce/resourceUrl/ai_navigator_logo';

export default class AiNavigatorHeader extends LightningElement {
    @api activeTab = 'dashboard';
    @api companySelected = false;
    @api selectedCompanyName = '';
    @api notificationCount = 3;

    // Public properties to receive company details dynamically
    @api companyCity = '';
    @api companyState = '';
    @api companyWebsite = '';
    @api companyStatus = '';

    @track isDropdownOpen = false;
    @track showNotificationsMenu = false;
    @track currentUserName = 'Aharon Koss'; // Default fallback value
    @track currentUserInitial = 'A';       // Default fallback initial

    logoUrl = AI_NAV_LOGO;

    // Fetch User Name dynamically via Salesforce wire adapter
    @wire(getRecord, { recordId: USER_ID, fields: [NAME_FIELD] })
    wiredUser({ error, data }) {
        if (data) {
            this.currentUserName = data.fields.Name.value || 'Aharon Koss';
            if (this.currentUserName) {
                this.currentUserInitial = this.currentUserName.charAt(0).toUpperCase();
            }
        } else if (error) {
            console.error('Error retrieving Salesforce user details:', error);
        }
    }

    get tabs() {
        const companyStateDisabled = !this.companySelected;
        
        return [
            { 
                id: 'dashboard', 
                label: 'Dashboard', 
                disabled: false, 
                isDivider: false,
                classes: `nav-tab ${this.activeTab === 'dashboard' ? 'active-tab' : ''}`
            },
            { 
                id: 'upload', 
                label: 'Upload', 
                disabled: false, 
                isDivider: false,
                classes: `nav-tab ${this.activeTab === 'upload' ? 'active-tab' : ''}`
            },
            { 
                id: 'input', 
                label: 'Input', 
                disabled: false, 
                isDivider: false,
                classes: `nav-tab ${this.activeTab === 'input' ? 'active-tab' : ''}`
            },
            { 
                id: 'signals-config', 
                label: 'Signals Guide', 
                disabled: false, 
                isDivider: false,
                classes: `nav-tab ${this.activeTab === 'signals-config' ? 'active-tab' : ''}`
            },
            { id: 'div-1', isDivider: true },
            { 
                id: 'research', 
                label: 'Research', 
                disabled: companyStateDisabled, 
                isDivider: false,
                hasDot: !companyStateDisabled,
                isLocked: companyStateDisabled,
                classes: `nav-tab ${this.activeTab === 'research' ? 'active-tab' : ''} ${companyStateDisabled ? 'tab-disabled' : ''}`
            },
            { 
                id: 'signals', 
                label: 'Signals', 
                disabled: companyStateDisabled, 
                isDivider: false,
                hasDot: !companyStateDisabled,
                isLocked: companyStateDisabled,
                classes: `nav-tab ${this.activeTab === 'signals' ? 'active-tab' : ''} ${companyStateDisabled ? 'tab-disabled' : ''}`
            },
            { 
                id: 'enhanced-signals', 
                label: 'Enhanced Signal Digest', 
                disabled: companyStateDisabled, 
                isDivider: false,
                classes: `nav-tab ${this.activeTab === 'enhanced-signals' ? 'active-tab' : ''} ${companyStateDisabled ? 'tab-disabled' : ''}`
            },
            { 
                id: 'insights', 
                label: 'Insights', 
                disabled: companyStateDisabled, 
                isDivider: false,
                isLocked: companyStateDisabled,
                classes: `nav-tab ${this.activeTab === 'insights' ? 'active-tab' : ''} ${companyStateDisabled ? 'tab-disabled' : ''}`
            }
        ];
    }

    get hasLocation() {
        return !!(this.companyCity || this.companyState);
    }

    get formattedLocation() {
        const city = this.companyCity || '';
        const state = this.companyState || '';
        return city && state ? `${city}, ${state}` : `${city}${state}`;
    }

    get websiteUrl() {
        if (!this.companyWebsite) return '';
        return this.companyWebsite.startsWith('http') ? this.companyWebsite : `https://${this.companyWebsite}`;
    }

    get statusBadgeClass() {
        const status = (this.companyStatus || '').toLowerCase();
        if (status === 'completed') {
            return 'status-badge-completed';
        } else if (status === 'processing') {
            return 'status-badge-processing';
        }
        return 'status-badge-default';
    }

    get isCallPlanDisabled() {
        return !this.companySelected;
    }

    get isCallPlanActive() {
        return ['call-plan', 'coach', 'simulator'].includes(this.activeTab);
    }

    get callPlanButtonClass() {
        const baseClass = 'nav-tab dropdown-trigger';
        const activeClass = this.isCallPlanActive ? 'active-tab font-bold-mode' : '';
        const disabledClass = this.isCallPlanDisabled ? 'tab-disabled' : '';
        return `${baseClass} ${activeClass} ${disabledClass}`;
    }

    get hasNotifications() {
        return this.notificationCount > 0;
    }

    handleTabClick(event) {
        const selectedTab = event.currentTarget.dataset.tab;
        this.isDropdownOpen = false;
        this.dispatchEvent(new CustomEvent('tabchange', {
            detail: { tabId: selectedTab }
        }));
    }

    handleDropdownItemClick(event) {
        const selectedTab = event.currentTarget.dataset.tab;
        this.isDropdownOpen = false;
        this.dispatchEvent(new CustomEvent('tabchange', {
            detail: { tabId: selectedTab }
        }));
    }

    handleClearCompany() {
        this.dispatchEvent(new CustomEvent('clearcompany'));
    }

    toggleDropdown() {
        if (this.isCallPlanDisabled) return;
        this.isDropdownOpen = !this.isDropdownOpen;
    }

    closeDropdown() {
        this.isDropdownOpen = false;
    }

    toggleNotifications() {
        this.showNotificationsMenu = !this.showNotificationsMenu;
    }

    closeNotifications() {
        this.showNotificationsMenu = false;
    }

    markAllRead() {
        this.notificationCount = 0;
        this.showNotificationsMenu = false;
        this.dispatchEvent(new CustomEvent('clearnotifications'));
    }
}
import { LightningElement, api, track, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import NAME_FIELD from '@salesforce/schema/User.Name';
import AI_NAV_LOGO from '@salesforce/resourceUrl/ai_navigator_logo';
import getNotificationSignals from '@salesforce/apex/AI_Navigator_HeaderController.getNotificationSignals';

const POLLING_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default class NavigationHeader extends LightningElement {
    @api activeTab = 'dashboard';
    @api companySelected = false;
    @api selectedCompanyName = '';

    // Public properties to receive company details dynamically
    @api companyCity = '';
    @api companyState = '';
    @api companyWebsite = '';
    @api companyStatus = '';

    @track notificationCount = 0;
    @track notificationsList = [];
    @track isLoadingNotifications = false;
    @track isDropdownOpen = false;
    @track showNotificationsMenu = false;
    @track currentUserName = 'Aharon Koss';
    @track currentUserInitial = 'A';

    logoUrl = AI_NAV_LOGO;
    pollingTimer = null;

    connectedCallback() {
        this.fetchNotifications();
        this.startPolling();
    }

    disconnectedCallback() {
        this.stopPolling();
    }

    startPolling() {
        this.stopPolling();
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.pollingTimer = setInterval(() => {
            this.fetchNotifications(true);
        }, POLLING_INTERVAL_MS);
    }

    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    async fetchNotifications(isBackground = false) {
        if (!isBackground) {
            this.isLoadingNotifications = true;
        }

        try {
            const responseStr = await getNotificationSignals();
            if (responseStr) {
                const data = JSON.parse(responseStr);
                
                this.notificationCount = data.totalNewSignals ?? data.totalSignals ?? data.count ?? 0;
                
                const rawNotifications = data.notifications || [];
                this.notificationsList = rawNotifications.map((item) => ({
                    ...item,
                    formattedDate: this.formatDate(item.latestDetectedAt),
                    priorityClass: this.getPriorityBadgeClass(item.priority)
                }));
            }
        } catch (error) {
            const errorDetails = error?.body?.message || error?.message || JSON.stringify(error);
            console.error('🚨 Detailed Notification Error:', errorDetails);
        } finally {
            this.isLoadingNotifications = false;
        }
    }

    formatDate(isoDateString) {
        if (!isoDateString) return '';
        try {
            const date = new Date(isoDateString);
            return date.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            return isoDateString;
        }
    }

    getPriorityBadgeClass(priority) {
        switch (priority) {
            case 'P1':
            case 'P2':
                return 'priority-badge priority-high';
            case 'P3':
            case 'P4':
                return 'priority-badge priority-medium';
            default:
                return 'priority-badge priority-low';
        }
    }

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
                id: 'insights', 
                label: 'Insights', 
                disabled: companyStateDisabled, 
                isDivider: false,
                isLocked: companyStateDisabled,
                classes: `nav-tab ${this.activeTab === 'insights' ? 'active-tab' : ''} ${companyStateDisabled ? 'tab-disabled' : ''}`
            },
            { 
                id: 'enhanced-signals', 
                label: 'Enhanced Signal Digest', 
                disabled: companyStateDisabled, 
                isDivider: false,
                classes: `nav-tab ${this.activeTab === 'enhanced-signals' ? 'active-tab' : ''} ${companyStateDisabled ? 'tab-disabled' : ''}`
            }
        ];
    }

    get showCompanyRibbon() {
        const nonCompanyTabs = ['dashboard', 'upload', 'input', 'signals-config'];
        return this.companySelected && !nonCompanyTabs.includes(this.activeTab);
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

    get hasFeedItems() {
        return this.notificationsList && this.notificationsList.length > 0;
    }

    handleTabClick(event) {
        const selectedTab = event.currentTarget.dataset.tab;
        this.isDropdownOpen = false;
        this.showNotificationsMenu = false;
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

    handleNotificationItemClick(event) {
        const companyId = event.currentTarget.dataset.companyId;
        const companyName = event.currentTarget.dataset.companyName;
        
        this.showNotificationsMenu = false;
        this.dispatchEvent(new CustomEvent('companyselect', {
            detail: { companyId, companyName }
        }));
    }

    handleClearCompany() {
        this.dispatchEvent(new CustomEvent('clearcompany'));
    }

    toggleDropdown(event) {
        if (event) event.stopPropagation();
        if (this.isCallPlanDisabled) return;
        this.isDropdownOpen = !this.isDropdownOpen;
        if (this.isDropdownOpen) {
            this.showNotificationsMenu = false;
        }
    }

    closeDropdown() {
        this.isDropdownOpen = false;
    }

    // Toggle Notifications (Click on Bell opens/closes it; closes Call Plan if open)
    toggleNotifications(event) {
        if (event) event.stopPropagation();
        this.showNotificationsMenu = !this.showNotificationsMenu;
        if (this.showNotificationsMenu) {
            this.isDropdownOpen = false;
            this.fetchNotifications();
        }
    }

    // Closes popover when clicking off (backdrop)
    closeNotifications() {
        this.showNotificationsMenu = false;
    }

    markAllRead() {
        this.notificationCount = 0;
        this.showNotificationsMenu = false;
        this.dispatchEvent(new CustomEvent('clearnotifications'));
    }
}
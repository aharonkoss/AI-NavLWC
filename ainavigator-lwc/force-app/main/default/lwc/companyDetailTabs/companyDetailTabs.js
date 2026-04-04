import { LightningElement, api } from 'lwc';
const ALL_TABS = [
    { id: 'updates',  label: 'Updates'   },
    { id: 'research', label: 'Research'  },
    { id: 'signals',  label: 'Signals'   },
    { id: 'insights', label: 'Insights'  },
    { id: 'callplan', label: 'Call Plan' },
    { id: 'coach', label: '🎓 Coach' },
    { id: 'simulator', label: '🎮 Simulator' }
];
export default class CompanyDetailTabs extends LightningElement {
    @api activeTab = 'updates';

    get tabs() {
        return ALL_TABS.map(t => ({
            ...t,
            cls: t.id === this.activeTab
                ? 'cdt-tab cdt-tab-active'
                : 'cdt-tab'
        }));
    }

    handleClick(event) {
        const tab = event.currentTarget.dataset.tab;
        this.dispatchEvent(new CustomEvent('tabchange', { detail: { tab } }));
    }
}
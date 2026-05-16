import { LightningElement, track } from 'lwc';
import getSignalsConfig from '@salesforce/apex/SignalsConfigController.getSignalsConfig';

const PRIORITY_OPTIONS = [
    { label: 'P5 - Critical',      value: 'P5' },
    { label: 'P4 - High',          value: 'P4' },
    { label: 'P3 - Medium',        value: 'P3' },
    { label: 'P2 - Low',           value: 'P2' },
    { label: 'P1 - Informational', value: 'P1' }
];

const TIMEFRAME_OPTIONS = [
    { label: 'Immediate',  value: 'Immediate' },
    { label: 'Near-term',  value: 'Near-term' },
    { label: 'Long-term',  value: 'Long-term' }
];

export default class SignalsConfig extends LightningElement {
    @track categories = [];
    @track isLoading = true;
    @track error = null;
    @track isSaving = false;
    @track saveSuccess = false;

    priorityOptions = PRIORITY_OPTIONS;
    timeframeOptions = TIMEFRAME_OPTIONS;

    connectedCallback() {
        this.loadConfig();
    }

    loadConfig() {
        this.isLoading = true;
        this.error = null;
        getSignalsConfig()
            .then(result => {
                const raw = JSON.parse(result);
                this.categories = raw.map(cat => ({
                    ...cat,
                    isCollapsed: false,
                    signals: cat.signals.map(s => ({
                        ...s,
                        checkboxClass: s.enabled ? 'sc-checkbox sc-checkbox-checked' : 'sc-checkbox'
                    }))
                }));
                this.isLoading = false;
            })
            .catch(err => {
                console.error('Error loading signals config', err);
                this.error = err.body?.message || 'Failed to load signals configuration.';
                this.isLoading = false;
            });
    }

    // ── Computed ──
    get enabledCount() {
        return this.categories.reduce((total, cat) =>
            total + cat.signals.filter(s => s.enabled).length, 0);
    }

    get totalCount() {
        return this.categories.reduce((total, cat) =>
            total + cat.signals.length, 0);
    }

    get priorityBadges() {
        return [
            { level: 5, class: 'sc-priority-badge sc-p5' },
            { level: 4, class: 'sc-priority-badge sc-p4' },
            { level: 3, class: 'sc-priority-badge sc-p3' },
            { level: 2, class: 'sc-priority-badge sc-p2' },
            { level: 1, class: 'sc-priority-badge sc-p1' }
        ];
    }

    // ── Toggle collapse ──
    handleToggleCategory(event) {
        const categoryId = event.currentTarget.dataset.categoryId;
        this.categories = this.categories.map(cat =>
            cat.categoryId === categoryId
                ? { ...cat, isCollapsed: !cat.isCollapsed }
                : cat
        );
    }

    // ── Toggle signal enabled ──
    handleToggleSignal(event) {
        const categoryId = event.currentTarget.dataset.categoryId;
        const signalId   = event.currentTarget.dataset.signalId;
        this.categories = this.categories.map(cat => {
            if (cat.categoryId !== categoryId) return cat;
            return {
                ...cat,
                signals: cat.signals.map(s => {
                    if (s.id !== signalId) return s;
                    const enabled = !s.enabled;
                    return {
                        ...s,
                        enabled,
                        checkboxClass: enabled ? 'sc-checkbox sc-checkbox-checked' : 'sc-checkbox'
                    };
                })
            };
        });
    }

    // ── Priority change ──
    handlePriorityChange(event) {
        const categoryId = event.currentTarget.dataset.categoryId;
        const signalId   = event.currentTarget.dataset.signalId;
        const newPriority = event.target.value;
        this.categories = this.categories.map(cat => {
            if (cat.categoryId !== categoryId) return cat;
            return {
                ...cat,
                signals: cat.signals.map(s =>
                    s.id === signalId ? { ...s, priority: newPriority } : s
                )
            };
        });
    }

    // ── Timeframe change ──
    handleTimeframeChange(event) {
        const categoryId  = event.currentTarget.dataset.categoryId;
        const signalId    = event.currentTarget.dataset.signalId;
        const newTimeframe = event.target.value;
        this.categories = this.categories.map(cat => {
            if (cat.categoryId !== categoryId) return cat;
            return {
                ...cat,
                signals: cat.signals.map(s =>
                    s.id === signalId ? { ...s, timeframe: newTimeframe } : s
                )
            };
        });
    }

    // ── Save ──
    handleSave() {
        this.isSaving = true;
        this.saveSuccess = false;
        // MOCK: simulate API save
        setTimeout(() => {
            this.isSaving = false;
            this.saveSuccess = true;
            setTimeout(() => { this.saveSuccess = false; }, 3000);
        }, 800);
    }

    // ── Reset to defaults ──
    handleReset() {
        this.loadConfig();
    }

    // ── Category header helpers ──
    getCategoryActiveCount(cat) {
        return cat.signals.filter(s => s.enabled).length;
    }
}
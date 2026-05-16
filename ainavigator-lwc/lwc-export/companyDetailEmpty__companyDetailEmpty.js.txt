import { LightningElement } from 'lwc';
export default class CompanyDetailEmpty extends LightningElement {
    handleBack() {
        this.dispatchEvent(new CustomEvent('backtodashboard'));
    }
}
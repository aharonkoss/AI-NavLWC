import { LightningElement, track } from 'lwc';
import { updateRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Static Resource Imports
import TEMPLATE_CSV from '@salesforce/resourceUrl/Company_Upload_Template_CSV';
import TEMPLATE_XLSX from '@salesforce/resourceUrl/Company_Upload_Template_XLS';
import TEMPLATE_XLS from '@salesforce/resourceUrl/Company_Upload_Template_XLS';

// Apex Controller methods
import getUploadSettings from '@salesforce/apex/UploadController.getUploadSettings';
import getPreviousSubmissions from '@salesforce/apex/UploadController.getPreviousSubmissions';
import getPicklistOptions from '@salesforce/apex/UploadController.getPicklistOptions';
import uploadFile from '@salesforce/apex/UploadController.uploadFile';
import checkDuplicates from '@salesforce/apex/SubmissionsController.checkDuplicates';

export default class Upload extends LightningElement {
    @track settings = { dailyLimit: 50, usedToday: 0, remaining: 50 };
    @track submissions = [];
    @track isLoading = true;
    @track isUploading = false;
    @track error = null;
    @track successMessage = '';

    // Duplicate tracking state
    @track duplicateWarnings = [];
    @track skippedCount = 0;

    // Picklist selection values and options
    @track defaultStage = '';
    @track defaultClientType = '';
    @track stageOptions = [];
    @track clientTypeOptions = [];

    @track hoverDrop = false;
    @track searchTerm = '';

    // Simulation tracking for pending uploads
    simulatingSubmissionIds = new Set();
    activeTimeouts = [];

    connectedCallback() {
        this.loadData();
    }

    disconnectedCallback() {
        this.activeTimeouts.forEach(clearTimeout);
    }

    loadData() {
        this.isLoading = true;
        this.error     = null;

        Promise.all([
            getUploadSettings(),
            getPreviousSubmissions(),
            getPicklistOptions()
        ])
            .then(([settingsJson, subsJson, picklistMap]) => {
                this.settings = JSON.parse(settingsJson);
                
                const rawSubs = JSON.parse(subsJson);
                this.submissions = rawSubs.map(s => this.mapSubmission(s));

                // Process Picklist Options from Apex Describe
                this.stageOptions = picklistMap.stageOptions || [];
                this.clientTypeOptions = picklistMap.clientTypeOptions || [];

                // Validate picklists are populated
                if (this.stageOptions.length === 0 || this.clientTypeOptions.length === 0) {
                    this.error = 'Please populate Default Stage and Default Client Type picklists before proceeding with file uploads.';
                } else {
                    this.defaultStage = this.stageOptions[0].value;
                    this.defaultClientType = this.clientTypeOptions[0].value;
                }

                // Self-healing: complete any submissions that were left in processing
                rawSubs.forEach(s => {
                    if (s.status === 'processing') {
                        this.startPendingSimulation(s.recordId);
                    }
                });

                this.isLoading = false;
            })
            .catch(err => {
                console.error('[Upload Log] Error loading upload data', err);
                this.error     = err.body?.message || 'Failed to load upload data and picklists.';
                this.isLoading = false;
            });
    }

    // ── Static Resource Template Downloads ──────────────────────────────────
    downloadCsvTemplate(event) {
        if (event) event.preventDefault();
        this.downloadStaticResource(TEMPLATE_CSV, 'Company_Upload_Template.csv');
    }

    downloadXlsxTemplate(event) {
        if (event) event.preventDefault();
        this.downloadStaticResource(TEMPLATE_XLSX, 'Company_Upload_Template.xlsx');
    }

    downloadXlsTemplate(event) {
        if (event) event.preventDefault();
        this.downloadStaticResource(TEMPLATE_XLS, 'Company_Upload_Template.xls');
    }

    downloadStaticResource(resourceUrl, fileName) {
        const link = document.createElement('a');
        link.href = resourceUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ── Simulation loop ─────────────────────────────────────────────────────
    startPendingSimulation(recordId) {
        if (!recordId || this.simulatingSubmissionIds.has(recordId)) return;
        this.simulatingSubmissionIds.add(recordId);

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        const timeoutId = setTimeout(() => {
            this.completeSubmission(recordId);
        }, 20000);

        this.activeTimeouts.push(timeoutId);
    }

    completeSubmission(recordId) {
        const recordInput = {
            fields: {
                Id: recordId,
                Status__c: 'completed'
            }
        };

        updateRecord(recordInput)
            .then(() => {
                this.simulatingSubmissionIds.delete(recordId);
                this.submissions = this.submissions.map(s => {
                    if (s.recordId === recordId) {
                        return this.mapSubmission({ ...s, status: 'completed' });
                    }
                    return s;
                });
            })
            .catch(() => {
                this.simulatingSubmissionIds.delete(recordId);
                this.submissions = this.submissions.map(s => {
                    if (s.recordId === recordId) {
                        return this.mapSubmission({ ...s, status: 'completed' });
                    }
                    return s;
                });
            });
    }

    mapSubmission(s) {
        const isSimulating = this.simulatingSubmissionIds.has(s.recordId);
        const displayStatus = isSimulating ? 'processing' : (s.status || 'completed');

        const fileName = s.fileName || 'Bulk Upload';
        const shortSubId = s.submissionId ? s.submissionId.substring(0, 8) + '...' : '--';
        const totalCount = s.total != null ? `${s.total} companies` : null;

        return {
            ...s,
            displayName: fileName,
            shortSubmissionId: shortSubId,
            totalDisplay: totalCount,
            status: displayStatus,
            statusLabel: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
            submittedAtDisplay: s.submittedAt
                ? new Date(s.submittedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit'
                  })
                : new Date().toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit'
                  }),
            statusClass: this.getStatusClass(displayStatus)
        };
    }

    getStatusClass(status) {
        const map = {
            completed:  'status-pill status-completed',
            processing: 'status-pill status-processing',
            failed:     'status-pill status-failed'
        };
        return map[status] || 'status-pill status-processing';
    }

    get usedToday()            { return this.settings.usedToday || 0; }
    get dailyLimit()           { return this.settings.dailyLimit || 0; }
    get remaining()            { return this.settings.remaining || Math.max(0, this.dailyLimit - this.usedToday); }
    get hasSubmissions()       { return this.filteredSubmissions.length > 0; }
    get hasDuplicateWarnings() { return this.duplicateWarnings && this.duplicateWarnings.length > 0; }

    get filteredSubmissions() {
        let list = [...this.submissions];
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            list = list.filter(s =>
                s.displayName?.toLowerCase().includes(term) ||
                s.submissionId?.toLowerCase().includes(term)
            );
        }
        return list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }

    get dropZoneClass() {
        return 'drop-card' + (this.hoverDrop ? ' drop-card-hover' : '');
    }

    handleStageChange(event)      { this.defaultStage = event.target.value; }
    handleClientTypeChange(event) { this.defaultClientType = event.target.value; }

    handleSearchChange(event)     { this.searchTerm = event.target.value; }
    handleSearchClear()           { this.searchTerm = ''; }

    handleDragOver(event) {
        event.preventDefault();
        this.hoverDrop = true;
    }

    handleDragLeave(event) {
        event.preventDefault();
        this.hoverDrop = false;
    }

    handleDrop(event) {
        event.preventDefault();
        this.hoverDrop = false;
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileInputChange(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            this.processFile(files[0]);
        }
    }

    // ── File Processing with Cross-User Duplicate Check ─────────────────────
    async processFile(file) {
        if (this.isUploading) return;

        if (!this.defaultStage || !this.defaultClientType) {
            this.error = 'Please populate Default Stage and Default Client Type picklists before proceeding with file uploads.';
            return;
        }

        this.isUploading = true;
        this.error = null;
        this.successMessage = '';
        this.duplicateWarnings = [];
        this.skippedCount = 0;

        const ext = file.name.split('.').pop().toLowerCase();
        let rows = [];

        try {
            // 1. Client-Side XLSX Parser
            if (ext === 'xlsx') {
                const arrayBuffer = await file.arrayBuffer();
                const extractedXmls = await this.parseXlsxZip(arrayBuffer);
                const sheetXmlKey = Object.keys(extractedXmls).find(k => k.includes('sheet1.xml') || k.includes('sheet.xml'));
                const sharedStringsKey = Object.keys(extractedXmls).find(k => k.includes('sharedStrings.xml'));

                if (sheetXmlKey) {
                    rows = this.extractRowsFromSheetXml(extractedXmls[sheetXmlKey], extractedXmls[sharedStringsKey]);
                }
            } 
            // 2. Client-Side HTML/XML-based XLS Parser
            else if (ext === 'xls') {
                const text = await file.text();
                rows = this.parseHtmlOrXmlTable(text) || [];
            }
            // 3. Client-Side CSV Parser
            else {
                const text = await file.text();
                rows = this.parseCsvText(text);
            }

            if (!rows || rows.length < 2) {
                this.error = 'The uploaded file does not contain any company data rows.';
                this.isUploading = false;
                this.resetFileInput();
                return;
            }

            // Extract headers and map columns
            const headerRow = rows[0].map(h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
            const nameIdx = headerRow.findIndex(h => h.includes('company') || h.includes('name'));
            const webIdx = headerRow.findIndex(h => h.includes('website') || h.includes('url') || h.includes('domain'));

            if (nameIdx === -1 && webIdx === -1) {
                this.error = 'File must contain at least a "Company Name" or "Website" column.';
                this.isUploading = false;
                this.resetFileInput();
                return;
            }

            const dataRows = rows.slice(1).filter(r => r.some(cell => String(cell || '').trim().length > 0));

            // Prepare list for duplicate check
            const companiesToCheck = dataRows.map(r => ({
                companyName : nameIdx !== -1 ? String(r[nameIdx] || '').trim() : '',
                website     : webIdx !== -1 ? String(r[webIdx] || '').trim() : ''
            }));

            // 4. Apex Duplicate Check across all users in the org
            const dupResponse = await checkDuplicates({ companies: companiesToCheck });
            const duplicateMap = dupResponse?.duplicates || {};

            const validRows = [];
            const duplicateAlerts = [];

            dataRows.forEach((r, idx) => {
                const comp = companiesToCheck[idx];
                const cleanWeb = comp.website.toLowerCase().trim();
                const cleanName = comp.companyName.toLowerCase().trim();

                let dupMsg = null;
                if (cleanWeb && duplicateMap[cleanWeb]) {
                    dupMsg = duplicateMap[cleanWeb];
                } else if (cleanWeb && duplicateMap[comp.website]) {
                    dupMsg = duplicateMap[comp.website];
                } else if (cleanName && duplicateMap[cleanName]) {
                    dupMsg = duplicateMap[cleanName];
                } else if (cleanName && duplicateMap[comp.companyName]) {
                    dupMsg = duplicateMap[comp.companyName];
                }

                if (dupMsg) {
                    duplicateAlerts.push({
                        id: `dup-${idx}`,
                        name: comp.companyName || comp.website || `Row #${idx + 1}`,
                        message: dupMsg
                    });
                } else {
                    validRows.push(r);
                }
            });

            this.duplicateWarnings = duplicateAlerts;
            this.skippedCount = duplicateAlerts.length;

            // Trigger notification for each duplicate skipped
            duplicateAlerts.forEach(dup => {
                this.showToast('Duplicate Company Skipped', dup.message, 'warning');
            });

            // 5. If all rows were duplicates, skip upload entirely
            if (validRows.length === 0) {
                this.isUploading = false;
                this.error = `All ${dataRows.length} company records in "${file.name}" have already been submitted and were skipped.`;
                this.resetFileInput();
                return;
            }

            // 6. Continue processing remaining valid companies
            const finalCsvContent = [rows[0], ...validRows]
                .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
                .join('\r\n');

            const base64 = btoa(unescape(encodeURIComponent(finalCsvContent)));
            this.uploadToServer(file.name, base64, validRows.length);

        } catch (ex) {
            console.error('[Upload Log] Error processing file:', ex);
            this.error = ex.body?.message || ex.message || 'Failed to process file. Please ensure it is a valid CSV or Excel file.';
            this.isUploading = false;
            this.resetFileInput();
        }
    }

    uploadToServer(fileName, base64Data, processedCompanyCount) {
        uploadFile({
            fileName          : fileName,
            base64Data        : base64Data,
            defaultStage      : this.defaultStage,
            defaultClientType : this.defaultClientType
        })
        .then(resultJson => {
            const res = JSON.parse(resultJson);

            this.settings = {
                ...this.settings,
                dailyLimit : res.dailyLimit,
                usedToday  : res.usedToday,
                remaining  : res.remaining
            };

            const skipInfo = this.skippedCount > 0 
                ? ` (${this.skippedCount} duplicate${this.skippedCount === 1 ? '' : 's'} skipped)`
                : '';

            this.successMessage = (res.message || 'File uploaded successfully. Processing will start shortly.') + skipInfo;

            const newSub = this.mapSubmission({
                submissionId : res.submissionId,
                recordId     : res.recordId,
                fileName     : res.fileName,
                status       : 'processing',
                submittedAt  : new Date().toISOString(),
                total        : processedCompanyCount || res.totalCompanies
            });

            this.submissions = [newSub, ...this.submissions];

            if (res.recordId) {
                this.startPendingSimulation(res.recordId);
            }

            this.showToast(
                'Upload Success',
                `Successfully processed ${processedCompanyCount} companies${skipInfo}.`,
                'success'
            );

            this.dispatchEvent(new CustomEvent('uploadsubmitted', {
                bubbles : true,
                composed: true,
                detail  : {
                    submissionId  : res.submissionId,
                    correlationId : res.correlationId,
                    fileName      : res.fileName,
                    status        : 'processing'
                }
            }));
        })
        .catch(err => {
            console.error('[Upload Log] Upload error:', err);
            this.error = err.body?.message || 'Upload failed. Please try again.';
            this.showToast('Upload Failed', this.error, 'error');
        })
        .finally(() => {
            this.isUploading = false;
            this.resetFileInput();
        });
    }

    // ── Client-Side Parsers ──────────────────────────────────────────────────
    parseCsvText(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        return lines.map(line => {
            const row = [];
            let inQuotes = false;
            let cur = '';
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const next = line[i + 1];
                if (char === '"') {
                    if (inQuotes && next === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    row.push(cur.trim());
                    cur = '';
                } else {
                    cur += char;
                }
            }
            row.push(cur.trim());
            return row;
        });
    }

    async parseXlsxZip(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const uint8 = new Uint8Array(arrayBuffer);
        let offset = 0;
        const files = {};

        while (offset < uint8.length - 30) {
            const sig = view.getUint32(offset, true);
            if (sig === 0x04034b50) {
                const compMethod = view.getUint16(offset + 8, true);
                const compSize = view.getUint32(offset + 18, true);
                const nameLen = view.getUint16(offset + 26, true);
                const extraLen = view.getUint16(offset + 28, true);

                const nameBytes = uint8.subarray(offset + 30, offset + 30 + nameLen);
                const fileName = new TextDecoder().decode(nameBytes);
                const dataStart = offset + 30 + nameLen + extraLen;
                const dataEnd = dataStart + compSize;
                const compressedData = uint8.subarray(dataStart, dataEnd);

                if (fileName.includes('sharedStrings.xml') || fileName.includes('sheet1.xml') || fileName.includes('sheet.xml')) {
                    let xmlText = '';
                    if (compMethod === 0) {
                        xmlText = new TextDecoder().decode(compressedData);
                    } else if (compMethod === 8 && typeof DecompressionStream !== 'undefined') {
                        const ds = new DecompressionStream('deflate-raw');
                        const writer = ds.writable.getWriter();
                        writer.write(compressedData);
                        writer.close();
                        const response = new Response(ds.readable);
                        xmlText = await response.text();
                    }
                    files[fileName] = xmlText;
                }
                offset = dataEnd;
            } else if (sig === 0x02014b50 || sig === 0x06054b50) {
                break;
            } else {
                offset++;
            }
        }
        return files;
    }

    extractRowsFromSheetXml(sheetXml, sharedStringsXml) {
        const parser = new DOMParser();
        const sharedStrings = [];

        if (sharedStringsXml) {
            const ssDoc = parser.parseFromString(sharedStringsXml, 'application/xml');
            const siNodes = ssDoc.getElementsByTagName('si');
            for (let i = 0; i < siNodes.length; i++) {
                const tNodes = siNodes[i].getElementsByTagName('t');
                let str = '';
                for (let j = 0; j < tNodes.length; j++) {
                    str += tNodes[j].textContent;
                }
                sharedStrings.push(str);
            }
        }

        const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
        const rowNodes = sheetDoc.getElementsByTagName('row');
        const rows = [];

        for (let i = 0; i < rowNodes.length; i++) {
            const cNodes = rowNodes[i].getElementsByTagName('c');
            const row = [];

            for (let j = 0; j < cNodes.length; j++) {
                const c = cNodes[j];
                const r = c.getAttribute('r');
                let colIndex = j;

                if (r) {
                    const colLetters = r.replace(/[0-9]/g, '');
                    let num = 0;
                    for (let k = 0; k < colLetters.length; k++) {
                        num = num * 26 + (colLetters.charCodeAt(k) - 64);
                    }
                    colIndex = num - 1;
                }

                while (row.length < colIndex) {
                    row.push('');
                }

                const t = c.getAttribute('t');
                const vNode = c.getElementsByTagName('v')[0];
                let val = vNode ? vNode.textContent : '';

                if (t === 's') {
                    const sIndex = parseInt(val, 10);
                    val = sharedStrings[sIndex] !== undefined ? sharedStrings[sIndex] : val;
                } else if (t === 'inlineStr') {
                    const isT = c.getElementsByTagName('t')[0];
                    val = isT ? isT.textContent : val;
                }
                row[colIndex] = val;
            }
            if (row.length > 0) {
                rows.push(row);
            }
        }
        return rows;
    }

    parseHtmlOrXmlTable(text) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const trs = doc.querySelectorAll('tr');
        if (!trs || trs.length === 0) return null;

        const rows = [];
        trs.forEach(tr => {
            const row = [];
            tr.querySelectorAll('th, td').forEach(cell => {
                row.push(cell.textContent.trim());
            });
            if (row.length > 0) rows.push(row);
        });
        return rows.length > 0 ? rows : null;
    }

    // ── Notification and UI Helpers ──────────────────────────────────────────
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: variant === 'error' ? 'sticky' : 'dismissable'
        }));
    }

    handleDismissSuccess() {
        this.successMessage = '';
    }

    handleDismissError() {
        this.error = null;
    }

    handleDismissWarning(event) {
        const id = event.target.dataset.id;
        this.duplicateWarnings = this.duplicateWarnings.filter(w => w.id !== id);
    }

    handleDismissAllWarnings() {
        this.duplicateWarnings = [];
    }

    resetFileInput() {
        const input = this.template.querySelector('.up-file-input');
        if (input) input.value = '';
    }
}
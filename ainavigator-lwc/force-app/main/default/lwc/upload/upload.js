import { LightningElement, track } from 'lwc';
import { updateRecord } from 'lightning/uiRecordApi';

// Static Resource Imports
import TEMPLATE_CSV from '@salesforce/resourceUrl/Company_Upload_Template_CSV';
import TEMPLATE_XLSX from '@salesforce/resourceUrl/Company_Upload_Template_XLSX';
import TEMPLATE_XLS from '@salesforce/resourceUrl/Company_Upload_Template_XLS';

// Apex Controller methods
import getUploadSettings from '@salesforce/apex/UploadController.getUploadSettings';
import getPreviousSubmissions from '@salesforce/apex/UploadController.getPreviousSubmissions';
import getPicklistOptions from '@salesforce/apex/UploadController.getPicklistOptions';
import uploadFile from '@salesforce/apex/UploadController.uploadFile';

export default class Upload extends LightningElement {
    @track settings = { dailyLimit: 50, usedToday: 0, remaining: 50 };
    @track submissions = [];
    @track isLoading = true;
    @track isUploading = false;
    @track error = null;
    @track successMessage = '';

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

    get usedToday()      { return this.settings.usedToday || 0; }
    get dailyLimit()     { return this.settings.dailyLimit || 0; }
    get remaining()      { return this.settings.remaining || Math.max(0, this.dailyLimit - this.usedToday); }
    get hasSubmissions() { return this.filteredSubmissions.length > 0; }

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

    async processFile(file) {
        if (this.isUploading) return;

        if (!this.defaultStage || !this.defaultClientType) {
            this.error = 'Please populate Default Stage and Default Client Type picklists before proceeding with file uploads.';
            return;
        }

        const ext = file.name.split('.').pop().toLowerCase();

        try {
            // 1. Client-Side XLSX Parser
            if (ext === 'xlsx') {
                const arrayBuffer = await file.arrayBuffer();
                const extractedXmls = await this.parseXlsxZip(arrayBuffer);
                const sheetXmlKey = Object.keys(extractedXmls).find(k => k.includes('sheet1.xml') || k.includes('sheet.xml'));
                const sharedStringsKey = Object.keys(extractedXmls).find(k => k.includes('sharedStrings.xml'));

                if (sheetXmlKey) {
                    const rows = this.extractRowsFromSheetXml(extractedXmls[sheetXmlKey], extractedXmls[sharedStringsKey]);
                    if (rows && rows.length > 0) {
                        const csvContent = rows
                            .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
                            .join('\r\n');
                        const base64 = btoa(unescape(encodeURIComponent(csvContent)));
                        this.uploadToServer(file.name, base64);
                        return;
                    }
                }
            } 
            // 2. Client-Side HTML/XML-based XLS Parser
            else if (ext === 'xls') {
                const text = await file.text();
                const rows = this.parseHtmlOrXmlTable(text);
                if (rows && rows.length > 0) {
                    const csvContent = rows
                        .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
                        .join('\r\n');
                    const base64 = btoa(unescape(encodeURIComponent(csvContent)));
                    this.uploadToServer(file.name, base64);
                    return;
                }
            }
        } catch (parseEx) {
            console.warn('[Upload Log] Client Excel parsing fallback to raw file:', parseEx);
        }

        // Standard CSV / fallback stream reader
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            this.uploadToServer(file.name, base64);
        };
        reader.readAsDataURL(file);
    }

    // ── Native OpenXML (.xlsx) Parser ───────────────────────────────────────
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

    uploadToServer(fileName, base64Data) {
        this.isUploading    = true;
        this.error          = null;
        this.successMessage = '';

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

            this.successMessage = res.message ||
                'File uploaded successfully. Processing will start shortly.';

            const newSub = this.mapSubmission({
                submissionId : res.submissionId,
                recordId     : res.recordId,
                fileName     : res.fileName,
                status       : 'processing',
                submittedAt  : new Date().toISOString(),
                total        : res.totalCompanies
            });

            this.submissions = [newSub, ...this.submissions];

            if (res.recordId) {
                this.startPendingSimulation(res.recordId);
            }

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
        })
        .finally(() => {
            this.isUploading = false;
            const input = this.template.querySelector('.up-file-input');
            if (input) input.value = '';
        });
    }
}
import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import jsPDFLibrary from '@salesforce/resourceUrl/jsPDFLibrary';

export default class PdfGenerator extends LightningElement {

    jsPDFInitialized = false;

    renderedCallback() {
        if (!this.jsPDFInitialized) {
            this.jsPDFInitialized = true;
            loadScript(this, jsPDFLibrary)
                .then(() => {
                    console.log('✅ jsPDF loaded');
                    this.dispatchEvent(new CustomEvent('pdfready'));
                })
                .catch(error => {
                    console.error('❌ jsPDF load failed', error);
                });
        }
    }

    @api
    generatePDF(reportType, companyName, data) {
        console.log('📄 generatePDF called', { reportType, companyName, dataLength: data?.length });

        if (!this.jsPDFInitialized) {
            console.error('❌ jsPDF not initialized');
            return;
        }

        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            console.error('❌ window.jspdf not available');
            return;
        }

        // ── Unwrap LWC Proxy to plain JS ──
        let plainData;
        try {
            plainData = JSON.parse(JSON.stringify(data));
            console.log('✅ Data unwrapped, isArray:', Array.isArray(plainData), 'length:', plainData?.length);
        } catch (e) {
            console.error('❌ Failed to unwrap data proxy:', e.message);
            return;
        }

        console.log('✅ jsPDF available, building document...');
        const doc = new jsPDF();
        console.log('📋 companyName value:', JSON.stringify(companyName), 'type:', typeof companyName);
        const cleanName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
        const typeMap = {
            'liveUpdates':       'LiveUpdates',
            'signals':           'Signals',
            'callPlan':          'DiscoveryCallPlan',
            'discoveryCallPlan': 'DiscoveryCallPlan'  // ← ADD this alias
        };
        const filename = `${cleanName}_${typeMap[reportType] || 'Report'}.pdf`;
        console.log('📝 Filename:', filename);
        // ── PDF Header ──
        const safeName = String(companyName || 'Unknown Company');
        const safeType = String(typeMap[reportType] || 'Report');
        const safeDate = new Date().toLocaleDateString();

        console.log('📝 Safe values:', { safeName, safeType, filename });
       let y = 20;
        try {
            doc.setFontSize(18);
            doc.text(safeName, 20, y);
            y += 10;
            doc.setFontSize(14);
            doc.text(`${safeType} Report`, 20, y);
            y += 10;
            doc.setFontSize(10);
            doc.text(`Generated: ${safeDate}`, 20, y);
            y += 15;
            console.log('✅ Header written successfully');
        } catch (headerError) {
            console.error('❌ Header write failed:', headerError.message);
            return;
        }

        try {
            console.log('📦 Data sample:', JSON.stringify(plainData)?.substring(0, 300));
            if (reportType === 'liveUpdates') {
                this._renderLiveUpdates(doc, plainData, y);
            } else if (reportType === 'signals') {
                this._renderSignals(doc, plainData, y);
            } else if (reportType === 'callPlan') {
                this._renderCallPlan(doc, plainData, y);
            }
            console.log('✅ PDF content built, attempting save...');
        } catch (renderError) {
            console.error('❌ Render failed:', renderError.message, renderError.stack);
            return;
        }

        // ── Save PDF ──
        try {
            const pdfBlob = doc.output('blob');
            console.log('✅ Blob generated, size:', pdfBlob.size);
            const blobUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
            console.log('✅ Download triggered for:', filename);
            this.dispatchEvent(new CustomEvent('pdfsaved', { detail: { filename } }));
        } catch (saveError) {
            console.error('❌ PDF save failed:', saveError.message, saveError.stack);
        }
        
    }

    _renderLiveUpdates(doc, updates, startY) {
        let y = startY;
        doc.setFontSize(12);
        doc.text('Live Updates', 20, y);
        y += 8;

        if (!updates || updates.length === 0) {
            doc.setFontSize(10);
            doc.text('No updates available', 20, y);
            return;
        }

        updates.forEach((update, idx) => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`${idx + 1}. ${update.headline || 'Update'}`, 20, y);
            y += 6;
            doc.setFont(undefined, 'normal');
            const summaryLines = doc.splitTextToSize(update.summary || '', 170);
            doc.text(summaryLines, 20, y);
            y += summaryLines.length * 5 + 5;
            doc.setFontSize(8);
            doc.text(`Category: ${update.category || 'N/A'} | Impact: ${update.impact || 'N/A'}`, 20, y);
            y += 8;
        });
    }

    _renderSignals(doc, data, startY) {
        let y = startY;

        // Safety unwrap in case array is still wrapped
        const signals = Array.isArray(data) ? data : (data?.signals || []);

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Signals', 20, y);
        y += 8;

        if (!signals || signals.length === 0) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text('No signals available', 20, y);
            return;
        }

        signals.forEach((signal, idx) => {
            if (y > 265) { doc.addPage(); y = 20; }

            // Signal name
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(`${idx + 1}. ${signal.signalName || signal.name || 'Signal'}`, 20, y);
            y += 6;

            // Description — Apex uses signalDescription
            const desc = signal.signalDescription || signal.description || signal.insight || '';
            if (desc) {
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
                const descLines = doc.splitTextToSize(desc, 170);
                doc.text(descLines, 20, y);
                y += descLines.length * 5 + 3;
            }

            // Meta row
            doc.setFontSize(8);
            const category = signal.signalCategory || signal.category || 'N/A';
            const priority = signal.priority || signal.signalPriority || 'N/A';
            const impact   = signal.impact || '';
            const date     = signal.eventDate || signal.date || '';
            let meta = `Category: ${category} | Priority: ${priority}`;
            if (impact) meta += ` | Impact: ${impact}`;
            if (date)   meta += ` | Date: ${date}`;
            doc.text(meta, 20, y);
            y += 10;

            // Divider
            if (idx < signals.length - 1) {
                doc.setDrawColor(220, 220, 220);
                doc.line(20, y - 4, 190, y - 4);
            }
        });
    }

    _renderCallPlan(doc, data, startY) {
        let y = startY;
        console.log('🔍 _renderCallPlan data:', JSON.stringify(data)?.substring(0, 300));

        // Unwrap the callPlan wrapper if present
        const plan = data.callPlan || data;
        
        // ── Handle discoveryFramework structure (co-002 style) ──
        if (plan.discoveryFramework && plan.discoveryFramework.length > 0) {

            if (plan.callObjective) {
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.text('Call Objective:', 20, y);
                y += 6;
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
                const objLines = doc.splitTextToSize(plan.callObjective, 170);
                doc.text(objLines, 20, y);
                y += objLines.length * 5 + 8;
            }

            if (plan.openingStatement) {
                if (y > 260) { doc.addPage(); y = 20; }
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.text('Opening Statement:', 20, y);
                y += 6;
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
                const openLines = doc.splitTextToSize(plan.openingStatement, 170);
                doc.text(openLines, 20, y);
                y += openLines.length * 5 + 8;
            }

            plan.discoveryFramework.forEach((step, idx) => {
                if (y > 240) { doc.addPage(); y = 20; }
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.text(`${idx + 1}. ${step.step || 'Step'}`, 20, y);
                y += 6;
                if (step.description) {
                    doc.setFont(undefined, 'italic');
                    doc.setFontSize(10);
                    const descLines = doc.splitTextToSize(step.description, 170);
                    doc.text(descLines, 20, y);
                    y += descLines.length * 5 + 4;
                }
                if (step.questions && step.questions.length > 0) {
                    doc.setFont(undefined, 'normal');
                    doc.setFontSize(10);
                    step.questions.forEach((q, qIdx) => {
                        if (y > 270) { doc.addPage(); y = 20; }
                        const qLines = doc.splitTextToSize(`${qIdx + 1}. ${q}`, 165);
                        doc.text(qLines, 25, y);
                        y += qLines.length * 5 + 2;
                    });
                }
                y += 8;
            });

        // ── Handle callPlans array structure (co-004 style) ──
        } else if (plan.callPlans && plan.callPlans.length > 0) {

            if (plan.overallStrategy) {
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.text('Overall Strategy:', 20, y);
                y += 6;
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
                const stratLines = doc.splitTextToSize(plan.overallStrategy, 170);
                doc.text(stratLines, 20, y);
                y += stratLines.length * 5 + 10;
            }

            plan.callPlans.forEach((cp, idx) => {
                if (y > 240) { doc.addPage(); y = 20; }
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text(`Signal ${idx + 1}: ${cp.signalName || 'Signal'}`, 20, y);
                y += 8;

                ['insight', 'callObjective', 'openingStatement'].forEach(field => {
                    if (cp[field]) {
                        if (y > 260) { doc.addPage(); y = 20; }
                        const label = field === 'callObjective' ? 'Call Objective' :
                                    field === 'openingStatement' ? 'Opening Statement' : 'Insight';
                        doc.setFontSize(10);
                        doc.setFont(undefined, 'bold');
                        doc.text(`${label}:`, 20, y);
                        y += 5;
                        doc.setFont(undefined, 'normal');
                        const lines = doc.splitTextToSize(cp[field], 170);
                        doc.text(lines, 20, y);
                        y += lines.length * 5 + 6;
                    }
                });

                if (cp.discoveryQuestions?.length > 0) {
                    if (y > 260) { doc.addPage(); y = 20; }
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'bold');
                    doc.text('Discovery Questions:', 20, y);
                    y += 5;
                    doc.setFont(undefined, 'normal');
                    cp.discoveryQuestions.forEach((q, qIdx) => {
                        if (y > 270) { doc.addPage(); y = 20; }
                        const qLines = doc.splitTextToSize(`${qIdx + 1}. ${q}`, 165);
                        doc.text(qLines, 25, y);
                        y += qLines.length * 5 + 2;
                    });
                    y += 8;
                }

                if (idx < plan.callPlans.length - 1) {
                    doc.setDrawColor(200, 200, 200);
                    doc.line(20, y, 190, y);
                    y += 10;
                }
            });

        } else {
            doc.setFontSize(10);
            doc.text('No call plan available', 20, y);
        }
    }
}
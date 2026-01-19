import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
// docx imports removed
import QRCode from 'qrcode';
import { createRoot } from 'react-dom/client';
import React from 'react';

// Templates
import LuxuryTemplate from '../components/certificates/templates/LuxuryTemplate';
import ClassicTemplate from '../components/certificates/templates/ClassicTemplate';
// TechTemplate import removed
import CustomTemplate from '../components/certificates/templates/CustomTemplate';
import { CertificateTemplateId } from '../components/certificates/templates/types';
import { Certificate, User, Event } from '../types';

export const getTemplateComponent = (templateId: CertificateTemplateId) => {
    switch (templateId) {
        case 'luxury': return LuxuryTemplate;
        case 'classic': return ClassicTemplate;
        // TechTemplate removed
        case 'custom': return CustomTemplate;
        default: return CustomTemplate;
    }
};

interface ExportOptions {
    certificate: Certificate;
    user: User | undefined;
    event?: Event;
    config: any;
    overrideName?: string;
}

export const generateCertificateImage = async (options: ExportOptions) => {
    const { certificate: cert, user, event, config, overrideName } = options;
    const Template = getTemplateComponent((cert.template_id as CertificateTemplateId) || 'custom');

    // Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(cert.qr_verify || cert.id, { margin: 1, width: 200 });

    const certData = {
        recipientName: overrideName || user?.full_name || 'Học sinh',
        title: cert.title,
        eventName: (cert as any).manualEventName || '',
        issuedDate: (cert as any).issuedDate || '',
        type: cert.type,
        verifyCode: cert.id.substring(0, 8).toUpperCase(),
        verifyQR: qrCodeDataUrl
    };

    // Create container
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'fixed', // Fixed to ensure it doesn't affect scroll
        left: '-10000px',
        top: '0px',
        zIndex: '-1000' // Push behind everything
    });
    document.body.appendChild(container);

    const root = createRoot(container);

    // Inject CSS for fonts - Critical for html2canvas
    const style = document.createElement('style');
    style.setAttribute('data-export-style', 'true');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
        .font-loader-check { font-family: 'Playfair Display'; }
        .font-loader-check-2 { font-family: 'Dancing Script'; }
    `;
    document.head.appendChild(style);

    // Force font loading by adding hidden elements
    const fontLoader = document.createElement('div');
    fontLoader.style.position = 'absolute';
    fontLoader.style.visibility = 'hidden';
    fontLoader.innerHTML = `
        <span style="font-family: 'Playfair Display', serif; font-weight: 400;">PlayfairRegular</span>
        <span style="font-family: 'Playfair Display', serif; font-weight: 700;">PlayfairBold</span>
        <span style="font-family: 'Dancing Script', cursive; font-weight: 400;">DancingRegular</span>
        <span style="font-family: 'Dancing Script', cursive; font-weight: 700;">DancingBold</span>
    `;
    document.body.appendChild(fontLoader);

    // Explicitly load fonts
    try {
        await Promise.all([
            document.fonts.load("400 1em 'Playfair Display'"),
            document.fonts.load("700 1em 'Playfair Display'"),
            document.fonts.load("400 1em 'Dancing Script'"),
            document.fonts.load("700 1em 'Dancing Script'")
        ]);
    } catch (e) {
        console.warn("Font load warning:", e);
    }

    // Render
    await document.fonts.ready; // Wait again for good measure

    await new Promise<void>((resolve) => {
        // Double render trick to ensure fonts apply to new elements
        root.render(React.createElement(Template, { data: certData, customConfig: config }));
        setTimeout(() => {
            root.render(React.createElement(Template, { data: certData, customConfig: config }));
            // Wait a bit longer for layout to settle with fonts
            setTimeout(resolve, 1000);
        }, 300);
    });

    try {
        const element = container.querySelector('#certificate-node') as HTMLElement;
        if (!element) throw new Error("Template render failed");

        const width = element.offsetWidth;
        const height = element.offsetHeight;

        const canvas = await html2canvas(element, {
            scale: 2, // High res for print
            useCORS: true,
            backgroundColor: null,
            width: width,
            height: height,
            logging: false
        });

        return {
            imgData: canvas.toDataURL('image/png'),
            width,
            height
        };

    } catch (err) {
        console.error("Export Error:", err);
        return null;
    } finally {
        if (document.body.contains(container)) document.body.removeChild(container);
        const fontLoader = document.querySelector('div[style*="font-family"]'); // Poor man's selector or scope it better
        // Actually better to just remove it if we had a ref, but for now relies on GC or specific cleanup if we assigned ID?
        // Let's rely on document.body.removeChild if we appended it to body.
        // Wait, I appended fontLoader to body separately.
        // It's safer to remove it.
        if (fontLoader && fontLoader.parentNode) fontLoader.parentNode.removeChild(fontLoader);
        const addedStyle = document.querySelector('style[data-export-style]');
        if (addedStyle && addedStyle.parentNode) addedStyle.parentNode.removeChild(addedStyle);
    }
};

// generateWordDocument removed

export const generateBatchPDF = async (
    certificates: { cert: Certificate, user: User | undefined, config: any, overrideName?: string }[],
    zipName: string
) => {
    const zip = new JSZip();
    const folder = zip.folder("Certificates");
    let count = 0;

    for (const item of certificates) {
        const result = await generateCertificateImage({
            certificate: item.cert,
            user: item.user,
            config: item.config,
            overrideName: item.overrideName
        });

        if (result && folder) {
            const pdf = new jsPDF({
                orientation: result.width > result.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [result.width, result.height]
            });
            pdf.addImage(result.imgData, 'PNG', 0, 0, result.width, result.height);

            const sanitizedName = (item.overrideName || item.cert.user_id).replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
            folder.file(`${sanitizedName}_${item.cert.id}.pdf`, pdf.output('blob'));
            count++;
        }
    }

    if (count > 0) {
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, zipName);
    }
    return count;
};

export const generateSingleExportPDF = async (
    certificates: { cert: Certificate, user: User | undefined, config: any, overrideName?: string }[],
    fileName: string
) => {
    // Single PDF with multiple pages logic
    const doc = new jsPDF({
        orientation: 'landscape', // Default, will adjust per page
        unit: 'px'
    });

    // Remove default first page if we are going to add pages dynamically, or just use it.
    // jsPDF is tricky with mixed orientations.
    // Easier strategy: Generate individual PDFs and zip them, OR strict single PDF.
    // User liked the "Single PDF" feature.
    // Let's implement single file PDF.

    let isFirst = true;

    for (const item of certificates) {
        const result = await generateCertificateImage({
            certificate: item.cert,
            user: item.user,
            config: item.config,
            overrideName: item.overrideName
        });

        if (result) {
            const orientation = result.width > result.height ? 'landscape' : 'portrait';
            if (isFirst) {
                // Configure first page - simply set its size
                // jsPDF starts with one page. We resize it.
                // deletePage(1) is buggy in some versions if only 1 page exists.
                // Safer: Set page size of current page (1)
                const pdfWidth = orientation === 'landscape' ? Math.max(result.width, result.height) : Math.min(result.width, result.height);
                const pdfHeight = orientation === 'landscape' ? Math.min(result.width, result.height) : Math.max(result.width, result.height);
                // Actually jsPDF constructor set size, but valid only if same.
                // We just add a new page with correct size and then delete the first blank one at the end if needed.
                // OR: Just addPage for EVERY certificate and delete the very first default page at the start.

                // Let's try: Add page for ALL, then delete page 1.
                doc.addPage([result.width, result.height], orientation);
                isFirst = false;
            } else {
                doc.addPage([result.width, result.height], orientation);
            }

            // Current page is the one just added
            doc.addImage(result.imgData, 'PNG', 0, 0, result.width, result.height);
        }
    }

    if (!isFirst) {
        doc.deletePage(1); // Delete the initial default page
        doc.save(fileName);
        return certificates.length;
    }
    return 0;
};


import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import QRCode from 'qrcode';
import { createRoot } from 'react-dom/client';
import React from 'react';

// Templates
import LuxuryTemplate from '../components/certificates/templates/LuxuryTemplate';
import ClassicTemplate from '../components/certificates/templates/ClassicTemplate';
import CustomTemplate from '../components/certificates/templates/CustomTemplate';
import { CertificateTemplateId } from '../components/certificates/templates/types';
import { Certificate, User, Event } from '../types';

export const getTemplateComponent = (templateId: CertificateTemplateId) => {
    switch (templateId) {
        case 'luxury': return LuxuryTemplate;
        case 'classic': return ClassicTemplate;
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

/**
 * Generate certificate image using html-to-image (SVG foreignObject approach).
 * This preserves web fonts perfectly because it embeds all CSS + @font-face
 * as inline data URIs in the SVG, which is then rendered to canvas.
 */
export const generateCertificateImage = async (options: ExportOptions) => {
    const { certificate: cert, user, event, config, overrideName } = options;
    const Template = getTemplateComponent((cert.template_id as CertificateTemplateId) || 'custom');

    // Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(cert.qr_verify || cert.id, { margin: 1, width: 200 });

    const certData = {
        recipientName: overrideName || user?.full_name || config?.recipient_name || 'Người nhận',
        title: cert.title,
        eventName: config?.manualEventName || (cert as any).manualEventName || '',
        issuedDate: config?.issuedDate || (cert as any).issuedDate || '',
        type: cert.type,
        verifyCode: cert.id.substring(0, 8).toUpperCase(),
        verifyQR: qrCodeDataUrl
    };

    // Create container
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'absolute',
        left: '0px',
        top: '0px',
        visibility: 'hidden',
        zIndex: '-1000',
        pointerEvents: 'none'
    });
    document.body.appendChild(container);

    const root = createRoot(container);

    // Ensure Google Fonts are loaded
    const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Arimo:wght@400;700&family=Cinzel:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&family=Great+Vibes&family=Alex+Brush&family=Pinyon+Script&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Be+Vietnam+Pro:wght@400;700&display=swap';

    let fontLink = document.querySelector('link[data-cert-fonts]') as HTMLLinkElement;
    if (!fontLink) {
        fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = GOOGLE_FONTS_URL;
        fontLink.setAttribute('data-cert-fonts', 'true');
        document.head.appendChild(fontLink);
        await new Promise<void>((resolve) => {
            fontLink!.onload = () => resolve();
            fontLink!.onerror = () => resolve();
            setTimeout(resolve, 3000);
        });
    }

    await document.fonts.ready;

    // Render template (double render for font application)
    await new Promise<void>((resolve) => {
        root.render(React.createElement(Template, { data: certData, customConfig: config }));
        setTimeout(() => {
            root.render(React.createElement(Template, { data: certData, customConfig: config }));
            setTimeout(resolve, 1500);
        }, 500);
    });

    try {
        const element = container.querySelector('#certificate-node') as HTMLElement;
        if (!element) throw new Error("Template render failed");

        element.style.visibility = 'visible';

        // Wait for all images
        const images = Array.from(element.querySelectorAll('img'));
        await Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }));

        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 500));

        const width = element.offsetWidth;
        const height = element.offsetHeight;

        // html-to-image uses SVG foreignObject which:
        // 1. Embeds ALL CSS inline (including computed @font-face)
        // 2. Converts font files to data URIs automatically
        // 3. Preserves web fonts PERFECTLY in the output
        const imgData = await toJpeg(element, {
            quality: 0.92,
            pixelRatio: 2,
            width: width,
            height: height,
            cacheBust: true,
            skipFonts: false,
            filter: (node: HTMLElement) => {
                return node.tagName !== 'NOSCRIPT';
            }
        });

        return { imgData, width, height };

    } catch (err) {
        console.error("Export Error:", err);
        return null;
    } finally {
        setTimeout(() => {
            try {
                root.unmount();
                if (document.body.contains(container)) document.body.removeChild(container);
            } catch (e) {
                console.error("Cleanup error:", e);
            }
        }, 500);
    }
};

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
            pdf.addImage(result.imgData, 'JPEG', 0, 0, result.width, result.height);

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
    let doc: jsPDF | null = null;
    let count = 0;

    for (const item of certificates) {
        const result = await generateCertificateImage({
            certificate: item.cert,
            user: item.user,
            config: item.config,
            overrideName: item.overrideName
        });

        if (result) {
            const orientation = result.width > result.height ? 'landscape' : 'portrait';

            if (!doc) {
                // First cert: create PDF with correct dimensions (no blank page)
                doc = new jsPDF({
                    orientation,
                    unit: 'px',
                    format: [result.width, result.height]
                });
            } else {
                // Subsequent certs: add new page
                doc.addPage([result.width, result.height], orientation);
            }

            doc.addImage(result.imgData, 'JPEG', 0, 0, result.width, result.height);
            count++;
        }
    }

    if (doc && count > 0) {
        doc.save(fileName);
    }
    return count;
};

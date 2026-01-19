import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header, Footer } from 'docx';
import { saveAs } from 'file-saver';
import { Certificate } from '../types';

export const generateWordCertificate = async (
    data: {
        recipientName: string;
        title: string;
        eventName: string;
        issuedDate: string;
        verifyCode: string;
        verifyQR: string; // Base64
    },
    customConfig?: any
) => {
    // Basic implementation mimicking the "Luxury" or "Custom" layout
    // Since we can't easily do complex CSS-to-Docx, we use a simple professional layout.

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1000,
                        right: 1000,
                        bottom: 1000,
                        left: 1000,
                    },
                },
            },
            children: [
                new Paragraph({
                    text: customConfig?.labels?.title || "CERTIFICATE",
                    heading: "Title",
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                    run: {
                        size: 72, // 36pt
                        bold: true,
                        color: customConfig?.textColor?.replace('#', '') || "b49148",
                        font: "Times New Roman"
                    }
                }),
                new Paragraph({
                    text: customConfig?.labels?.presentedTo || "Trao tặng cho",
                    alignment: AlignmentType.CENTER,
                    run: {
                        italics: true,
                        size: 28,
                        font: "Times New Roman"
                    }
                }),
                new Paragraph({
                    text: data.recipientName.toUpperCase(),
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 },
                    run: {
                        bold: true,
                        size: 60, // 30pt
                        color: "1e293b",
                        font: "Times New Roman"
                    }
                }),
                new Paragraph({
                    text: customConfig?.labels?.eventPrefix || "Đã hoàn thành xuất sắc / Successfully completed",
                    alignment: AlignmentType.CENTER,
                    run: {
                        italics: true,
                        size: 24,
                        font: "Times New Roman"
                    }
                }),
                new Paragraph({
                    text: data.eventName,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                    run: {
                        bold: true,
                        size: 36, // 18pt
                        font: "Times New Roman"
                    }
                }),

                // Footer Table simulated with columns? Docx supports tables ideally.
                // For simplicity, we just list them or use a table if possible.
                // Using valid docx configuration for table... simpler to just stack text for v1.

                new Paragraph({
                    text: `${customConfig?.labels?.entryNo || 'Vào sổ số'}: ${data.verifyCode}`,
                    alignment: AlignmentType.LEFT,
                    run: { size: 20, font: "Times New Roman" }
                }),
                new Paragraph({
                    text: `${customConfig?.labels?.datePrefix || 'Ngày cấp'}: ${data.issuedDate}`,
                    alignment: AlignmentType.LEFT,
                    run: { size: 20, font: "Times New Roman" }
                }),
                new Paragraph({
                    text: "",
                    spacing: { after: 200 }
                }),
                new Paragraph({
                    text: customConfig?.labels?.signature || "BAN TỔ CHỨC",
                    alignment: AlignmentType.RIGHT,
                    run: {
                        bold: true,
                        size: 24,
                        font: "Times New Roman"
                    }
                }),
            ]
        }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Certificate_${data.recipientName.replace(/\s+/g, '_')}.docx`);
};

/**
 * EduCheck - PDF Service
 * Supports batch card printing with school branding
 */

interface CardData {
  fullName: string;
  role: string;
  roleLabel?: string; // Custom display label (e.g. 'Đại biểu') — overrides default role label
  cardColor?: string; // Custom card background color (hex)
  code: string;
  className?: string;
  roomName?: string;
  avatarUrl?: string;
  qrCode: string;
  eventName?: string;
  birthDate?: string;
  // NEW: School settings
  schoolLogo?: string;
  schoolName?: string;
  hotline?: string;
  expiryDate?: string;
}

interface CertificateData {
  recipientName: string;
  title: string;
  eventName?: string;
  issuedDate: string;
  type: 'participation' | 'completion' | 'excellent';
  verifyCode: string;
  verifyQR: string;
}

// Convert URL to base64 to avoid CORS issues in export
async function urlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // Fallback to original URL
  }
}

export function generateCardHTML(data: CardData): string {
  const roleColors: Record<string, string> = { 'student': '#4f46e5', 'teacher': '#059669', 'guest': '#d97706', 'admin': '#dc2626' };
  const roleColor = data.cardColor || roleColors[data.role] || '#4f46e5';

  const roleLabels: Record<string, string> = { 'student': 'Học sinh', 'teacher': 'Giáo viên', 'admin': 'Quản trị', 'guest': 'Khách' };
  const roleLabel = data.roleLabel || roleLabels[data.role] || data.role;

  const schoolName = data.schoolName || 'EduCheck';
  const hotline = data.hotline ? `ĐT: ${data.hotline}` : '';
  const expiryDate = data.expiryDate ? `HSD: ${data.expiryDate}` : '';

  // Logo section - transparent background, no white frame
  const logoHTML = data.schoolLogo
    ? `<img src="${data.schoolLogo}" style="width:32px;height:32px;border-radius:6px;object-fit:contain;" />`
    : `<div style="width:32px;height:32px;border-radius:6px;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;border:1px solid rgba(255,255,255,0.3);">EC</div>`;

  return `
    <div class="card" style="width:340px;height:215px;background:linear-gradient(135deg,${roleColor} 0%,${roleColor}dd 100%);border-radius:16px;padding:15px;color:white;font-family:'Plus Jakarta Sans','Be Vietnam Pro',sans-serif;position:relative;overflow:hidden;box-sizing:border-box;">
      <div style="position:absolute;top:-50px;right:-50px;width:200px;height:200px;background:rgba(255,255,255,0.08);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-30px;left:-30px;width:120px;height:120px;background:rgba(255,255,255,0.05);border-radius:50%;"></div>
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;">
        <div style="z-index:1;display:flex;align-items:center;gap:8px;">
            ${logoHTML}
            <div>
                <div style="font-size:13px;font-weight:800;line-height:1.2;">${schoolName}</div>
                <div style="font-size:9px;opacity:0.75;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${data.eventName || (data.role === 'teacher' ? 'Thẻ Giáo Viên' : 'Thẻ Học Sinh')}</div>
            </div>
        </div>
        <img src="${data.qrCode}" style="width:80px;height:80px;border-radius:8px;background:white;padding:3px;z-index:1;" />
      </div>
      
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="position:relative;width:55px;height:75px;margin-top:-12px;">
            ${data.avatarUrl
    ? `<img src="${data.avatarUrl}" style="width:100%;height:100%;border-radius:8px;object-fit:cover;border:2px solid rgba(255,255,255,0.5);background:white;" />`
    : `<div style="width:100%;height:100%;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`
    }
        </div>
        
        <div style="flex:1;z-index:1;padding-top:2px;">
            <div style="font-size:15px;font-weight:800;line-height:1.2;margin-bottom:3px;">${data.fullName}</div>
            <div style="font-size:10px;opacity:0.95;margin-bottom:2px;">Mã số: <strong>${data.code}</strong></div>
            ${data.className ? `<div style="font-size:10px;opacity:0.95;margin-bottom:2px;">Lớp/ĐV: <strong>${data.className}</strong></div>` : ''}
            ${data.birthDate ? `<div style="font-size:10px;opacity:0.95;">NS: <strong>${formatDate(data.birthDate)}</strong></div>` : ''}
        </div>
      </div>
      
      <div style="position:absolute;bottom:8px;left:15px;right:15px;display:flex;justify-content:space-between;align-items:center;font-size:8px;opacity:0.8;z-index:1;">
        <span style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${roleLabel}</span>
        <span style="display:flex;gap:8px;">
            ${hotline ? `<span>${hotline}</span>` : ''}
            ${expiryDate ? `<span style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:8px;">${expiryDate}</span>` : ''}
        </span>
      </div>
    </div>`;
}

// Simple date formatter
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('vi-VN').format(date);
  } catch {
    return dateStr;
  }
}

export function generateCertificateHTML(data: CertificateData): string {
  const typeConfig: Record<string, { color: string; icon: string; label: string }> = {
    'participation': { color: '#3b82f6', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`, label: 'GIẤY XÁC NHẬN THAM GIA' },
    'completion': { color: '#10b981', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>`, label: 'GIẤY CHỨNG NHẬN HOÀN THÀNH' },
    'excellent': { color: '#f59e0b', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`, label: 'GIẤY KHEN XUẤT SẮC' }
  };
  const config = typeConfig[data.type] || typeConfig.participation;

  return `
    <div style="width:800px;height:566px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);border:3px solid ${config.color};border-radius:20px;padding:40px;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:20px;left:20px;width:60px;height:60px;border-top:4px solid ${config.color};border-left:4px solid ${config.color};border-radius:10px 0 0 0;"></div>
      <div style="position:absolute;top:20px;right:20px;width:60px;height:60px;border-top:4px solid ${config.color};border-right:4px solid ${config.color};border-radius:0 10px 0 0;"></div>
      <div style="position:absolute;bottom:20px;left:20px;width:60px;height:60px;border-bottom:4px solid ${config.color};border-left:4px solid ${config.color};border-radius:0 0 0 10px;"></div>
      <div style="position:absolute;bottom:20px;right:20px;width:60px;height:60px;border-bottom:4px solid ${config.color};border-right:4px solid ${config.color};border-radius:0 0 10px 0;"></div>
      <div style="text-align:center;padding-top:20px;">
        <div style="margin-bottom:10px;display:flex;justify-content:center;">${config.icon}</div>
        <div style="font-size:14px;color:${config.color};letter-spacing:4px;margin-bottom:20px;font-weight:600;">${config.label}</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b;margin-bottom:30px;line-height:1.3;">${data.title}</div>
        <div style="font-size:14px;color:#64748b;margin-bottom:10px;">Được trao tặng cho</div>
        <div style="font-size:36px;font-weight:800;color:${config.color};margin-bottom:20px;font-style:italic;">${data.recipientName}</div>
        ${data.eventName ? `<div style="font-size:14px;color:#64748b;margin-bottom:30px;">Đã tham gia: ${data.eventName}</div>` : '<div style="height:44px;"></div>'}
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:40px;padding:0 40px;">
          <div style="text-align:left;"><div style="font-size:12px;color:#94a3b8;margin-bottom:5px;">Ngày cấp</div><div style="font-size:16px;font-weight:600;color:#1e293b;">${data.issuedDate}</div></div>
          <div style="text-align:center;"><img src="${data.verifyQR}" style="width:80px;height:80px;border-radius:8px;" /><div style="font-size:10px;color:#94a3b8;margin-top:5px;">Mã xác thực: ${data.verifyCode}</div></div>
          <div style="text-align:right;"><div style="font-size:12px;color:#94a3b8;margin-bottom:5px;">Người cấp</div><div style="width:120px;height:40px;border-bottom:2px solid #e2e8f0;"></div><div style="font-size:12px;color:#64748b;margin-top:5px;">Ban tổ chức</div></div>
        </div>
      </div>
      <div style="position:absolute;bottom:15px;left:0;right:0;text-align:center;font-size:10px;color:#94a3b8;">Chứng nhận được tạo bởi EduCheck - Hệ thống check-in AI</div>
    </div>`;
}

// Print single card/certificate
export function printHTML(html: string): void {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(generatePrintPage(html));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  }
}

// Print multiple cards in batch
export function printBatchCards(htmlCards: string[]): void {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    const cardsPerPage = 8;
    let combinedHTML = '';

    for (let i = 0; i < htmlCards.length; i += cardsPerPage) {
      const batch = htmlCards.slice(i, i + cardsPerPage);
      combinedHTML += `
        <div class="print-page" style="page-break-after: always; display: grid; grid-template-columns: repeat(2, 1fr); gap: 5mm; justify-items: center; align-content: start; min-height: 280mm; padding: 5mm;">
          ${batch.map(card => `
            <div class="card-wrapper" style="page-break-inside: avoid; margin-bottom: 5mm;">
              ${card}
            </div>
          `).join('')}
        </div>
      `;
    }

    printWindow.document.write(generatePrintPage(combinedHTML, true));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 1200);
  }
}

function generatePrintPage(content: string, isBatch: boolean = false): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>In Thẻ EduCheck</title>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Be+Vietnam+Pro:wght@400;700&display=swap" rel="stylesheet">
    <style>
        * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 10px;
            font-family: 'Plus Jakarta Sans', 'Be Vietnam Pro', sans-serif;
            background: #f5f5f5;
        }
        .cards-container {
            max-width: 210mm;
            margin: 0 auto;
        }
        .print-page {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 5mm;
            justify-items: center;
            align-content: start;
            padding: 5mm;
        }
        .card-wrapper {
            margin-bottom: 2mm;
        }
        @media print {
            body { margin: 0; padding: 0; background: white; }
            .cards-container {
                display: block;
            }
            .print-page {
                page-break-after: always;
                min-height: 276mm;
                padding: 5mm 10mm;
            }
            .print-page:last-child {
                page-break-after: auto;
            }
            .card-wrapper { page-break-inside: avoid; }
            .card {
                width: 90mm !important; 
                height: 56mm !important;
                border-radius: 8px !important;
                padding: 10px !important;
            }
            .card > div {
                 transform-origin: top left;
             }
            @page {
                margin: 5mm; 
                size: A4 portrait;
            }
        }
        .print-info {
            text-align: center;
            padding: 10px;
            background: #4f46e5;
            color: white;
            margin-bottom: 15px;
            border-radius: 10px;
            font-weight: bold;
            font-size: 14px;
        }
        @media print {
            .print-info { display: none !important; }
        }
    </style>
</head>
<body>
    ${isBatch ? '<div class="print-info" style="display:flex;align-items:center;justify-content:center;gap:8px;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg> Nhấn Ctrl+P. Chọn "In màu nền". Layout 8 thẻ/trang A4 (2x4).</div>' : ''}
    <div class="cards-container">
        ${content}
    </div>
</body>
</html>`;
}


// Export as PDF
export async function downloadBatchCardsAsPDF(
  htmlCards: string[],
  filename: string = 'The_EduCheck.pdf',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  try {
    const { default: jsPDF } = await import('jspdf');
    
    // Try html-to-image first, fallback to html2canvas
    let captureModule: any;
    try {
      captureModule = await import('html-to-image');
    } catch {
      captureModule = null;
    }

    const container = document.createElement('div');
    // Use off-screen positioning instead of visibility:hidden to ensure rendering
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px'; // 210mm in px at 96dpi
    container.style.background = '#ffffff';
    container.style.fontFamily = "'Plus Jakarta Sans','Be Vietnam Pro',sans-serif";
    container.style.zIndex = '-1';
    document.body.appendChild(container);

    // Preload Google Fonts
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Be+Vietnam+Pro:wght@400;700&display=swap';
    document.head.appendChild(fontLink);
    await new Promise(resolve => setTimeout(resolve, 800));

    const pdf = new jsPDF('p', 'mm', 'a4');
    const cardsPerPage = 8;
    const totalPages = Math.ceil(htmlCards.length / cardsPerPage);

    for (let i = 0; i < htmlCards.length; i += cardsPerPage) {
      const batch = htmlCards.slice(i, i + cardsPerPage);
      const pageNum = Math.floor(i / cardsPerPage);

      container.innerHTML = `
        <div style="padding:10mm;display:grid;grid-template-columns:repeat(2,1fr);gap:8mm;justify-items:center;width:794px;min-height:1123px;box-sizing:border-box;background:#ffffff;">
            ${batch.map(card => `<div style="width:90mm;height:56mm;overflow:hidden;border-radius:8px;">${card}</div>`).join('')}
        </div>
      `;

      // Wait for images and fonts to load
      const images = container.querySelectorAll('img');
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));
      await new Promise(resolve => setTimeout(resolve, 600));

      let imgData: string;

      if (captureModule?.toPng) {
        // Use toPng instead of toJpeg for better color accuracy
        imgData = await captureModule.toPng(container.firstElementChild as HTMLElement, {
          quality: 1,
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: false,
          backgroundColor: '#ffffff',
        });
      } else {
        // Fallback: html2canvas
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        imgData = canvas.toDataURL('image/png', 1);
      }

      if (i > 0) pdf.addPage();

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      // Use full A4 page
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfPageHeight);

      // Report progress
      if (onProgress) {
        onProgress(pageNum + 1, totalPages);
      }
    }

    pdf.save(filename);
    document.body.removeChild(container);
    // Clean up font link
    if (fontLink.parentNode) fontLink.parentNode.removeChild(fontLink);
  } catch (error) {
    console.error('PDF Generation failed:', error);
    throw error;
  }
}

export const pdfService = {
  generateCardHTML,
  generateCertificateHTML,
  printHTML,
  printBatchCards,
  downloadBatchCardsAsPDF,
  urlToBase64
};

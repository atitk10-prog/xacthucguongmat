/**
 * EduCheck - PDF Service
 * Supports batch card printing with colors preserved
 */

interface CardData {
  fullName: string;
  role: string;
  code: string;
  className?: string;
  roomName?: string;
  avatarUrl?: string;
  qrCode: string;
  eventName?: string;
  birthDate?: string; // Added field
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

export function generateCardHTML(data: CardData): string {
  const roleColors: Record<string, string> = { 'student': '#4f46e5', 'teacher': '#059669', 'guest': '#d97706', 'admin': '#dc2626' };
  const roleColor = roleColors[data.role] || '#4f46e5';

  // Resize image to 4x6 ratio (e.g. 60px x 90px)
  // object-fit: cover to fill the frame but maintain aspect ratio (centered)

  return `
    <div class="card" style="width:340px;height:215px;background:linear-gradient(135deg,${roleColor} 0%,${roleColor}dd 100%);border-radius:16px;padding:15px;color:white;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden;box-sizing:border-box;">
      <div style="position:absolute;top:-50px;right:-50px;width:200px;height:200px;background:rgba(255,255,255,0.1);border-radius:50%;"></div>
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;">
        <div style="z-index: 1;">
            <div style="font-size:10px;opacity:0.8;text-transform:uppercase;letter-spacing:2px;">EduCheck</div>
            <div style="font-size:13px;font-weight:700;">${data.eventName || 'Thẻ Học Sinh'}</div>
        </div>
        <img src="${data.qrCode}" style="width:90px;height:90px;border-radius:6px;background:white;padding:4px;z-index: 1;" />
      </div>
      
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <!-- Photo 4x6 Ratio (60x90) -->
        <div style="position:relative;width:60px;height:90px;margin-top:-20px;">
            ${data.avatarUrl
      ? `<img src="${data.avatarUrl}" style="width:100%;height:100%;border-radius:8px;object-fit:cover;border:2px solid rgba(255,255,255,0.5);background:white;" />`
      : `<div style="width:100%;height:100%;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;border:2px solid rgba(255,255,255,0.3);">👤</div>`
    }
        </div>
        
        <div style="flex:1;z-index: 1;padding-top:2px;">
            <div style="font-size:16px;font-weight:800;line-height:1.2;margin-bottom:4px;">${data.fullName}</div>
            <div style="font-size:11px;opacity:0.95;margin-bottom:2px;">Mã số: <strong>${data.code}</strong></div>
            ${data.className ? `<div style="font-size:11px;opacity:0.95;margin-bottom:2px;">Lớp/Đơn vị: <strong>${data.className}</strong></div>` : ''}
            ${data.birthDate ? `<div style="font-size:11px;opacity:0.95;">Ngày sinh: <strong>${formatDate(data.birthDate)}</strong></div>` : ''}
        </div>
      </div>
      
      <div style="position:absolute;bottom:10px;left:15px;right:15px;display:flex;justify-content:space-between;align-items:center;font-size:9px;opacity:0.8;">
        <span style="background:rgba(255,255,255,0.2);padding:3px 8px;border-radius:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">${data.role}</span>
        <span>Powered by EduCheck AI</span>
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
    'participation': { color: '#3b82f6', icon: '🎯', label: 'GIẤY XÁC NHẬN THAM GIA' },
    'completion': { color: '#10b981', icon: '✅', label: 'GIẤY CHỨNG NHẬN HOÀN THÀNH' },
    'excellent': { color: '#f59e0b', icon: '🏆', label: 'GIẤY KHEN XUẤT SẮC' }
  };
  const config = typeConfig[data.type] || typeConfig.participation;

  return `
    <div style="width:800px;height:566px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);border:3px solid ${config.color};border-radius:20px;padding:40px;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:20px;left:20px;width:60px;height:60px;border-top:4px solid ${config.color};border-left:4px solid ${config.color};border-radius:10px 0 0 0;"></div>
      <div style="position:absolute;top:20px;right:20px;width:60px;height:60px;border-top:4px solid ${config.color};border-right:4px solid ${config.color};border-radius:0 10px 0 0;"></div>
      <div style="position:absolute;bottom:20px;left:20px;width:60px;height:60px;border-bottom:4px solid ${config.color};border-left:4px solid ${config.color};border-radius:0 0 0 10px;"></div>
      <div style="position:absolute;bottom:20px;right:20px;width:60px;height:60px;border-bottom:4px solid ${config.color};border-right:4px solid ${config.color};border-radius:0 0 10px 0;"></div>
      <div style="text-align:center;padding-top:20px;">
        <div style="font-size:48px;margin-bottom:10px;">${config.icon}</div>
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

// Print multiple cards in batch - Grouped into pages of 8 for reliability
export function printBatchCards(htmlCards: string[]): void {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    const cardsPerPage = 8;
    let combinedHTML = '';

    // Chunk cards into pages
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

    // Wait for images to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 1200);
  }
}

// Change to grid layout for 8 cards per A4 page
function generatePrintPage(content: string, isBatch: boolean = false): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>In Thẻ EduCheck</title>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
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
            font-family: 'Plus Jakarta Sans', sans-serif;
            background: #f5f5f5;
        }
        
        /* Grid layout for batch printing */
        .cards-container {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 10px;
            max-width: 210mm; /* A4 width */
            margin: 0 auto;
        }
        
        .card-wrapper {
            /* No specific width here, controlled by print media */
        }
        
        @media print {
            body {
                margin: 0;
                padding: 5mm; /* Minimum padding */
                background: white;
            }
            
            .cards-container {
                display: grid;
                grid-template-columns: repeat(2, 1fr); /* 2 columns */
                gap: 5mm; /* Gap between cards */
                justify-items: center;
            }
            
            .card-wrapper {
                page-break-inside: avoid;
            }
            
            /* Ensure card size fits 8 per page */
            /* A4 height is ~297mm. 4 rows needs < 74mm per row */
            /* Card height 56mm + gap should fit */
            
            .card {
                /* Reduce card size slightly for printing to ensure 8 fit */
                width: 90mm !important; 
                height: 56mm !important;
                border-radius: 8px !important;
                padding: 10px !important;
            }
            
            .card > div {
                 /* Scale content logic if needed, but fixed px units inside might be issue.
                    Using viewport units or relative units is better, but CSS scale is easiest */
                 transform-origin: top left;
             }

            @page {
                margin: 5mm; 
                size: A4 portrait;
            }
        }
        
        /* Print preview info */
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
            .print-info {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    ${isBatch ? '<div class="print-info">📄 Nhấn Ctrl+P. Chọn "In màu nền". Layout được tối ưu cho 8 thẻ/trang A4 (2x4).</div>' : ''}
    <div class="cards-container">
        ${content}
    </div>
</body>
</html>`;
}


// Export as PDF using jspdf + html2canvas
export async function downloadBatchCardsAsPDF(htmlCards: string[], filename: string = 'The_EduCheck.pdf'): Promise<void> {
  try {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    // 1. Create a hidden container for rendering
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm'; // A4 width
    container.style.background = 'white';
    document.body.appendChild(container);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const cardsPerPage = 8;

    for (let i = 0; i < htmlCards.length; i += cardsPerPage) {
      const batch = htmlCards.slice(i, i + cardsPerPage);

      // Clear and prepare container for this page
      container.innerHTML = `
                <div style="padding: 10mm; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; justify-items: center; width: 210mm; box-sizing: border-box;">
                    ${batch.map(card => `<div style="width: 90mm; height: 56mm; overflow: hidden; border-radius: 8px;">${card}</div>`).join('')}
                </div>
            `;

      // Wait a bit for images to render
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) pdf.addPage();

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(filename);
    document.body.removeChild(container);
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
  downloadBatchCardsAsPDF
};

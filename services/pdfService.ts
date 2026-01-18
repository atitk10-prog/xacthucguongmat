/**
 * EduCheck - PDF Service
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

    return `
    <div style="width:340px;height:215px;background:linear-gradient(135deg,${roleColor} 0%,${roleColor}dd 100%);border-radius:16px;padding:20px;color:white;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-50px;right:-50px;width:200px;height:200px;background:rgba(255,255,255,0.1);border-radius:50%;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <div><div style="font-size:10px;opacity:0.8;text-transform:uppercase;letter-spacing:2px;">EduCheck</div><div style="font-size:12px;font-weight:600;">${data.eventName || 'Thẻ tham gia'}</div></div>
        <img src="${data.qrCode}" style="width:60px;height:60px;border-radius:8px;background:white;padding:4px;" />
      </div>
      <div style="display:flex;gap:15px;">
        ${data.avatarUrl ? `<img src="${data.avatarUrl}" style="width:70px;height:70px;border-radius:12px;object-fit:cover;border:3px solid rgba(255,255,255,0.3);" />` : `<div style="width:70px;height:70px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:28px;">👤</div>`}
        <div style="flex:1;"><div style="font-size:18px;font-weight:700;margin-bottom:5px;">${data.fullName}</div><div style="font-size:11px;opacity:0.9;margin-bottom:3px;">Mã số: ${data.code}</div>${data.className ? `<div style="font-size:11px;opacity:0.9;">Lớp: ${data.className}</div>` : ''}</div>
      </div>
      <div style="position:absolute;bottom:12px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center;font-size:9px;opacity:0.7;">
        <span style="background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">${data.role}</span>
        <span>Powered by AI</span>
      </div>
    </div>`;
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

export function printHTML(html: string): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Print</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"><style>@media print { body { margin: 0; padding: 20px; } @page { margin: 0; size: auto; } }</style></head><body>${html}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
    }
}

export const pdfService = { generateCardHTML, generateCertificateHTML, printHTML };

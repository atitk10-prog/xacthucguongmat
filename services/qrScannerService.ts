/**
 * QR Scanner Service - Sử dụng html5-qrcode
 * Dùng để quét mã QR học sinh để check-in nội trú
 */

import { Html5Qrcode } from 'html5-qrcode';

let html5QrCode: Html5Qrcode | null = null;

export interface QRScanResult {
    content: string;
    type: 'user' | 'event' | 'certificate' | 'unknown';
    code: string;
}

/**
 * Khởi tạo QR Scanner
 */
export async function initScanner(elementId: string): Promise<Html5Qrcode> {
    if (html5QrCode) {
        await stopScanner();
    }
    html5QrCode = new Html5Qrcode(elementId);
    return html5QrCode;
}

/**
 * Bắt đầu quét QR
 */
export async function startScanning(
    elementId: string,
    onSuccess: (result: QRScanResult) => void,
    onError?: (error: string) => void
): Promise<void> {
    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode(elementId);
        }

        await html5QrCode.start(
            { facingMode: 'environment' }, // Camera sau (nếu có)
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
                // Parse QR content
                const result = parseQRContent(decodedText);
                onSuccess(result);
            },
            (errorMessage) => {
                // Lỗi decode (bình thường khi chưa tìm thấy QR)
                // Không cần log
            }
        );
    } catch (err: any) {
        console.error('Failed to start QR scanner:', err);
        if (onError) onError(err.message || 'Không thể mở camera');
    }
}

/**
 * Dừng quét QR
 */
export async function stopScanner(): Promise<void> {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (e) {
            console.warn('Error stopping scanner:', e);
        }
        html5QrCode = null;
    }
}

/**
 * Parse nội dung QR code
 */
export function parseQRContent(content: string): QRScanResult {
    // Format: EDUCHECK_USER:{student_code}
    if (content.startsWith('EDUCHECK_USER:')) {
        return {
            content,
            type: 'user',
            code: content.replace('EDUCHECK_USER:', '')
        };
    }

    // Format: /checkin?event=XXX
    if (content.includes('/checkin?event=')) {
        const match = content.match(/event=([A-Z0-9]+)/);
        return {
            content,
            type: 'event',
            code: match ? match[1] : ''
        };
    }

    // Format: /verify?code=XXX
    if (content.includes('/verify?code=')) {
        const match = content.match(/code=([A-Z0-9]+)/);
        return {
            content,
            type: 'certificate',
            code: match ? match[1] : ''
        };
    }

    // Mã đơn thuần (có thể là student_code)
    if (/^[A-Za-z0-9]{4,20}$/.test(content)) {
        return {
            content,
            type: 'user',
            code: content
        };
    }

    return {
        content,
        type: 'unknown',
        code: content
    };
}

/**
 * Kiểm tra camera có khả dụng không
 */
export async function hasCamera(): Promise<boolean> {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'videoinput');
    } catch {
        return false;
    }
}

export const qrScannerService = {
    initScanner,
    startScanning,
    stopScanner,
    parseQRContent,
    hasCamera
};

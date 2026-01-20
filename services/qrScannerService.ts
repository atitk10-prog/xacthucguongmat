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
 * @param elementId - ID của element chứa camera
 * @param onSuccess - Callback khi quét thành công
 * @param onError - Callback khi có lỗi
 * @param facingMode - 'environment' (camera sau) hoặc 'user' (camera trước)
 */
export async function startScanning(
    elementId: string,
    onSuccess: (result: QRScanResult) => void,
    onError?: (error: string) => void,
    facingMode: 'environment' | 'user' = 'environment'
): Promise<void> {
    try {
        // Stop existing scanner if any
        if (html5QrCode) {
            try {
                await html5QrCode.stop();
                html5QrCode.clear();
            } catch (e) {
                // Ignore stop errors
            }
        }

        html5QrCode = new Html5Qrcode(elementId);

        await html5QrCode.start(
            { facingMode }, // Camera trước hoặc sau
            {
                fps: 15, // Tăng từ 10 lên 15 để bắt QR nhanh hơn
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    // Adaptive qrbox: 70% of smaller dimension
                    // Giúp đọc QR lớn hơn trên màn hình lớn, và tốt hơn trên mobile
                    const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
                    const qrboxSize = Math.floor(minDimension * 0.7);
                    // Đảm bảo minimum size cho các màn hình nhỏ
                    const finalSize = Math.max(qrboxSize, 200);
                    return { width: finalSize, height: finalSize };
                },
                aspectRatio: 1.0, // Square aspect ratio cho QR detection tốt hơn
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

/**
 * EduCheck - QR Code Service
 */

export async function generateQRCode(data: string, size: number = 200): Promise<string> {
    const encodedData = encodeURIComponent(data);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}`;
}

export async function generateEventQR(eventId: string, eventCode: string): Promise<string> {
    const baseUrl = window.location.origin;
    const checkinUrl = `${baseUrl}/checkin?event=${eventCode}`;
    return generateQRCode(checkinUrl);
}

export async function generateUserQR(userCode: string): Promise<string> {
    return generateQRCode(`EDUCHECK_USER:${userCode}`);
}

export async function generateCertificateQR(verifyCode: string): Promise<string> {
    const baseUrl = window.location.origin;
    const verifyUrl = `${baseUrl}/verify?code=${verifyCode}`;
    return generateQRCode(verifyUrl);
}

export function parseQRContent(content: string): { type: 'event' | 'user' | 'certificate' | 'unknown'; code: string } {
    if (content.includes('/checkin?event=')) {
        const match = content.match(/event=([A-Z0-9]+)/);
        return { type: 'event', code: match ? match[1] : '' };
    }

    if (content.startsWith('EDUCHECK_USER:')) {
        return { type: 'user', code: content.replace('EDUCHECK_USER:', '') };
    }

    if (content.includes('/verify?code=')) {
        const match = content.match(/code=([A-Z0-9]+)/);
        return { type: 'certificate', code: match ? match[1] : '' };
    }

    if (/^[A-Z0-9]{6,12}$/.test(content)) {
        return { type: 'event', code: content };
    }

    return { type: 'unknown', code: content };
}

export async function generateBoardingQR(zone: string, type: 'morning' | 'evening'): Promise<string> {
    const baseUrl = window.location.origin;
    const checkinUrl = `${baseUrl}/boarding?zone=${zone}&type=${type}`;
    return generateQRCode(checkinUrl);
}

export const qrService = { generateQRCode, generateEventQR, generateUserQR, generateCertificateQR, generateBoardingQR, parseQRContent };

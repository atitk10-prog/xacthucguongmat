import { Certificate } from '../../../types';

export type CertificateTemplateId = 'classic' | 'tech' | 'luxury' | 'custom';

export interface CertificateTemplateProps {
    data: {
        recipientName: string;
        title: string;
        eventName: string;
        issuedDate: string;
        type: 'participation' | 'completion' | 'excellent';
        verifyCode: string;
        verifyQR: string;
    };
    customConfig?: {
        bgImage?: string;
        logoImage?: string;
        logos?: string[];
        paperSize?: 'A4' | 'A5' | 'B4' | 'A3';
        orientation?: 'landscape' | 'portrait';
        fontStyle?: 'serif' | 'sans' | 'handwriting' | 'times';
        titleFont?: 'serif' | 'sans' | 'handwriting' | 'times';
        recipientFont?: 'serif' | 'sans' | 'handwriting' | 'times';
        textColor?: string;
        showQR?: boolean;
        visibility?: {
            title?: boolean;
            recipient?: boolean;
            eventStr?: boolean;
            eventName?: boolean;
            date?: boolean;
            signature?: boolean;
            qr?: boolean;
            logo?: boolean;
        };
        labels?: {
            title?: string;
            presentedTo?: string;
            eventPrefix?: string;
            datePrefix?: string;
            signature?: string;
            entryNo?: string;
        };
    };
    scale?: number;
    onLabelChange?: (key: string, value: string) => void;
    isEditable?: boolean;
}

export const TEMPLATE_OPTIONS: { id: CertificateTemplateId; name: string; thumbnail: string }[] = [
    { id: 'custom', name: 'Tải Mẫu', thumbnail: '📤' },
    { id: 'luxury', name: 'Sang Trọng', thumbnail: '👑' },
    { id: 'classic', name: 'Cổ Điển', thumbnail: '🏛️' }
];

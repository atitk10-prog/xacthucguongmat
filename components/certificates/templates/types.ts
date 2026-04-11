export type CertificateTemplateId = 'classic' | 'luxury' | 'custom';

export type FontStyleType = 'serif' | 'sans' | 'handwriting' | 'times' | 'cinzel' | 'cormorant' | 'greatvibes' | 'alexbrush' | 'pinyon' | 'librebaskerville' | 'bevietnam';

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
        signatureImage?: string;
        sealImage?: string;
        logos?: string[];
        paperSize?: 'A4' | 'A5' | 'B4' | 'A3';
        orientation?: 'landscape' | 'portrait';
        fontStyle?: FontStyleType;
        titleFont?: FontStyleType;
        recipientFont?: FontStyleType;
        textColor?: string;
        showQR?: boolean;
        logoAlignment?: 'left' | 'center' | 'right';
        logoScale?: number;
        spacingScale?: number;
        titleScale?: number;
        positions?: {
            [key: string]: { x: number; y: number };
        };
        customTexts?: {
            id: string;
            content: string;
            x: number;
            y: number;
            fontSize?: number;
            color?: string;
            fontStyle?: FontStyleType;
        }[];
        elementStyles?: {
            [key: string]: {
                color?: string;
                scale?: number;
                fontStyle?: FontStyleType;
                fontSize?: number;
            };
        };
        bgMode?: 'cover' | 'contain' | 'fill';
        bgOpacity?: number;
        visibility?: {
            title?: boolean;
            recipient?: boolean;
            eventStr?: boolean;
            eventName?: boolean;
            date?: boolean;
            signature?: boolean;
            signatureImg?: boolean;
            seal?: boolean;
            entryNo?: boolean;
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

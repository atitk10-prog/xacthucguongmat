import React from 'react';
import { CertificateTemplateProps } from './types';
import { Award } from 'lucide-react';

const PAPER_DIMENSIONS = {
    A4: { width: 1123, height: 794 }, // Landscape px @ 96dpi
    A5: { width: 794, height: 559 },
    A3: { width: 1587, height: 1123 },
    B4: { width: 1335, height: 945 } // Approx
};

const CustomTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {
    const size = customConfig?.paperSize || 'A4';
    const dimensions = PAPER_DIMENSIONS[size];
    const { width, height } = dimensions;

    const Editable = ({ val, k, className, style }: { val: string, k: string, className?: string, style?: React.CSSProperties }) => {
        if (!isEditable || !onLabelChange) return <span className={className} style={style}>{val}</span>;
        return (
            <span
                contentEditable
                suppressContentEditableWarning
                className={`${className} outline-none cursor-text hover:bg-black/5 focus:bg-white/50 rounded px-1 transition-colors min-w-[20px] inline-block`}
                style={style}
                onBlur={(e) => onLabelChange(k, e.currentTarget.textContent || val)}
            >{val}</span>
        );
    };

    const getFontFamily = (style?: string) => {
        switch (style) {
            case 'handwriting': return "'Dancing Script', cursive";
            case 'sans': return "'Arimo', sans-serif";
            case 'times': return "'Times New Roman', serif";
            case 'serif': default: return "'Playfair Display', serif";
        }
    };

    const mainFont = getFontFamily(customConfig?.fontStyle);
    const titleFont = getFontFamily(customConfig?.titleFont || customConfig?.fontStyle);
    const recipientFont = getFontFamily(customConfig?.recipientFont || customConfig?.titleFont || customConfig?.fontStyle);
    const textColor = customConfig?.textColor || '#1e293b';

    const labels = {
        title: customConfig?.labels?.title || 'Certificate',
        presentedTo: customConfig?.labels?.presentedTo || 'Trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã tham gia sự kiện',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp:',
        signature: customConfig?.labels?.signature || 'Ban Tổ Chức',
        entryNo: customConfig?.labels?.entryNo || 'Vào sổ số: ______'
    };

    const isVisible = (field: keyof NonNullable<typeof customConfig>['visibility']) => {
        if (field === 'qr') {
            return customConfig?.visibility?.[field] === true;
        }
        return customConfig?.visibility?.[field] !== false;
    };

    // Spacing multiplier
    const s = customConfig?.spacingScale || 1;

    return (
        <div
            id="certificate-node"
            className="bg-white relative overflow-hidden mx-auto shadow-2xl"
            style={{
                width: `${width}px`,
                height: `${height}px`,
                minWidth: `${width}px`,
                minHeight: `${height}px`,
                color: textColor,
                fontFamily: mainFont
            }}
        >
            {/* Custom Background */}
            {customConfig?.bgImage ? (
                <img
                    src={customConfig.bgImage}
                    className="absolute inset-0 w-full h-full object-cover z-0"
                    alt="Certificate Background"
                />
            ) : (
                <div className="absolute inset-0 border-[20px] border-double border-slate-300 z-0 bg-slate-50"></div>
            )}

            {/* Grouped Logos - Positioned based on alignment */}
            {isVisible('logo') && customConfig?.logos && customConfig.logos.length > 0 && (
                <div
                    className={`absolute top-8 z-20 flex gap-4 ${customConfig.logoAlignment === 'left' ? 'left-8 justify-start' :
                        customConfig.logoAlignment === 'right' ? 'right-8 justify-end' :
                            'left-1/2 -translate-x-1/2 justify-center'
                        }`}
                    style={{ width: customConfig.logoAlignment === 'center' ? 'auto' : 'auto' }}
                >
                    {customConfig.logos.map((logo, index) => (
                        <img
                            key={index}
                            src={logo}
                            className="object-contain drop-shadow-sm transition-all"
                            style={{ height: `${24 * 4 * (customConfig.logoScale || 1)}px` }}
                            alt={`Logo ${index + 1}`}
                        />
                    ))}
                </div>
            )}

            {/* Content Overlay - Centered and Spaced */}
            <div className="relative z-10 w-full h-full flex flex-col items-center text-center"
                style={{
                    paddingTop: `${96 * s}px`,
                    paddingBottom: `${80 * s}px`,
                    paddingLeft: '96px',
                    paddingRight: '96px'
                }}>

                {/* Header Section: Logos & Title */}
                <div className="flex-none w-full" style={{ marginBottom: `${16 * s}px` }}>
                    {isVisible('title') && (
                        <h1 className="font-bold uppercase tracking-widest leading-none"
                            style={{
                                color: textColor,
                                fontFamily: titleFont,
                                fontSize: `${4.5 * (customConfig?.titleScale || 1)}rem`
                            }}>
                            <Editable val={labels.title} k="title" className="" />
                        </h1>
                    )}
                </div>

                {/* Body Section: Recipient & Event */}
                <div className="flex-grow flex flex-col justify-center w-full">
                    {isVisible('recipient') && (
                        <div style={{ marginBottom: `${32 * s}px` }}>
                            <p className="text-2xl italic font-light opacity-90" style={{ marginBottom: `${16 * s}px` }}>
                                <Editable val={labels.presentedTo} k="presentedTo" />
                            </p>
                            <h2 className="text-6xl font-bold py-2 px-8 inline-block"
                                style={{
                                    color: textColor,
                                    fontFamily: recipientFont,
                                    marginBottom: `${8 * s}px`,
                                    textShadow: mainFont.includes('Outfit') ? 'none' : '1px 1px 2px rgba(0,0,0,0.1)'
                                }}>
                                {data.recipientName}
                            </h2>
                        </div>
                    )}

                    {isVisible('eventName') && (
                        <div style={{ marginBottom: `${32 * s}px` }}>
                            {isVisible('eventStr') && <p className="text-xl opacity-80 max-w-3xl mx-auto leading-relaxed" style={{ marginBottom: `${12 * s}px` }}>
                                <Editable val={labels.eventPrefix} k="eventPrefix" />
                            </p>}
                            <h3 className="text-4xl font-bold max-w-4xl mx-auto leading-tight" style={{ color: textColor, fontFamily: titleFont }}>{data.eventName}</h3>
                        </div>
                    )}
                </div>

                {/* Footer Section: Signatures & QR */}
                <div className="flex-none w-full grid grid-cols-3 items-end mt-8">
                    {/* Left: Entry No & Date */}
                    <div className="text-left pl-12 pb-2">
                        <p className="text-lg italic opacity-80 mb-1">
                            <Editable val={labels.entryNo} k="entryNo" />
                        </p>
                        <div className="text-lg">
                            <span className="italic opacity-80 mr-2">
                                <Editable val={labels.datePrefix} k="datePrefix" />
                            </span>
                            {data.issuedDate && <span className="font-bold">{data.issuedDate}</span>}
                        </div>
                    </div>

                    {/* Center QR (If visible) */}
                    <div className="flex justify-center pb-2">
                        {isVisible('qr') && (
                            <div className="flex flex-col items-center">
                                <img src={data.verifyQR} className="w-24 h-24 border-2 border-white shadow-sm" alt="QR" />
                                <p className="text-[10px] font-mono mt-1 tracking-wider opacity-50">{data.verifyCode}</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Signature */}
                    <div className="text-center pb-2 flex flex-col items-center pr-12">
                        {isVisible('signature') && (
                            <>
                                <p className="text-xl font-bold uppercase tracking-wide mb-8">
                                    <Editable val={labels.signature} k="signature" />
                                </p>
                                <div className="h-24 w-full flex items-end justify-center font-['Dancing_Script'] text-3xl opacity-80">
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomTemplate;

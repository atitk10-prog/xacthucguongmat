import React from 'react';
import { CertificateTemplateProps } from './types';

const ClassicTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {
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
    const labels = {
        title: customConfig?.labels?.title || 'Giấy Chứng Nhận',
        presentedTo: customConfig?.labels?.presentedTo || 'Trân trọng trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã hoàn thành xuất sắc các yêu cầu của sự kiện',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp',
        signature: customConfig?.labels?.signature || 'Ban Tổ Chức',
        entryNo: customConfig?.labels?.entryNo || 'Vào sổ số: ______'
    };

    return (
        <div
            id="certificate-node"
            className="w-[800px] h-[566px] bg-[#fffbf0] relative p-8 font-['Playfair_Display'] text-[#1a1a1a] mx-auto shadow-2xl"
            style={{ width: '800px', height: '566px', minWidth: '800px', minHeight: '566px' }}
        >
            {/* Border Frame */}
            <div className="w-full h-full border-[6px] border-solid border-[#8b4513] relative p-1 box-border">
                <div className="w-full h-full border-[2px] border-solid border-[#8b4513] flex flex-col items-center justify-center p-8 relative box-border">

                    {/* Corners */}
                    {/* Corners - Using SVGs for reliable export */}
                    <div className="absolute top-2 left-2 w-16 h-16 pointer-events-none">
                        <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#8b4513" />
                        </svg>
                    </div>
                    <div className="absolute top-2 right-2 w-16 h-16 pointer-events-none rotate-90">
                        <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#8b4513" />
                        </svg>
                    </div>
                    <div className="absolute bottom-2 right-2 w-16 h-16 pointer-events-none rotate-180">
                        <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#8b4513" />
                        </svg>
                    </div>
                    <div className="absolute bottom-2 left-2 w-16 h-16 pointer-events-none -rotate-90">
                        <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#8b4513" />
                        </svg>
                    </div>

                    <div className="mb-6">
                        <img src="/educheck_logo.png" className="h-24 w-auto mx-auto object-contain drop-shadow-sm" alt="EduCheck Logo" />
                    </div>

                    <h1 className="text-6xl font-bold mb-4 text-[#8b4513] uppercase" style={{ fontFamily: 'Dancing Script, cursive' }}>
                        <Editable val={labels.title} k="title" />
                    </h1>

                    <p className="text-xl italic mb-6">
                        <Editable val={labels.presentedTo} k="presentedTo" />
                    </p>

                    <h2 className="text-4xl font-bold mb-4 text-[#2c1810]">
                        {data.recipientName}
                    </h2>

                    <p className="text-lg text-center max-w-2xl mb-2">
                        <Editable val={labels.eventPrefix} k="eventPrefix" />
                    </p>
                    {customConfig?.visibility?.eventName !== false && (
                        <h3 className="text-2xl font-bold mb-8 text-[#8b4513] uppercase">{data.eventName}</h3>
                    )}

                    <div className="w-full flex justify-between items-end mt-auto px-12">
                        <div className="text-left font-serif">
                            {customConfig?.visibility?.entryNo !== false && (
                                <p className="text-sm font-medium mb-1 opacity-80">
                                    <Editable val={labels.entryNo} k="entryNo" />
                                </p>
                            )}
                            {customConfig?.visibility?.date !== false && (
                                <p className="text-sm font-medium opacity-80">
                                    <Editable val={labels.datePrefix} k="datePrefix" />
                                </p>
                            )}
                        </div>

                        {customConfig?.visibility?.qr !== false && (
                            <div className="flex flex-col items-center">
                                <img src={data.verifyQR} alt="QR" className="w-20 h-20 mb-1 border-2 border-[#8b4513]" />
                                <p className="text-[10px] tracking-widest">{data.verifyCode}</p>
                            </div>
                        )}

                        <div className="text-center">
                            <p className="mb-8 italic font-bold uppercase">
                                <Editable val={labels.signature} k="signature" />
                            </p>
                            <div className="w-32"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClassicTemplate;

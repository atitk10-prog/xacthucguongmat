import React from 'react';
import { CertificateTemplateProps } from './types';
import { Crown } from 'lucide-react';

const LuxuryTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {

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

    // Labels with defaults (using customConfig if available)
    const labels = {
        title: customConfig?.labels?.title || 'Certificate',
        presentedTo: customConfig?.labels?.presentedTo || 'Trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã hoàn thành xuất sắc',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp',
        signature: customConfig?.labels?.signature || 'Ban Tổ Chức',
        entryNo: customConfig?.labels?.entryNo || 'Vào sổ số: ______'
    };

    return (
        <div
            id="certificate-node"
            className="w-[800px] h-[566px] bg-[#fffbf0] relative mx-auto shadow-2xl overflow-hidden font-['Playfair_Display']"
            style={{ width: '800px', height: '566px', minWidth: '800px', minHeight: '566px' }}
        >
            {/* Ornamental Border - SVG for better export */}
            <div className="absolute inset-2 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0.5" y="0.5" width="99" height="99" stroke="#b49148" strokeWidth="1" fill="none" />
                </svg>
            </div>
            <div className="absolute inset-4 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0.5" y="0.5" width="99" height="99" stroke="#b49148" strokeWidth="0.5" fill="none" />
                </svg>
            </div>

            {/* Corner Ornaments (CSS shapes -> SVG) */}
            <div className="absolute top-2 left-2 w-16 h-16 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#b49148" />
                </svg>
            </div>
            <div className="absolute top-2 right-2 w-16 h-16 pointer-events-none rotate-90">
                <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#b49148" />
                </svg>
            </div>
            <div className="absolute bottom-2 left-2 w-16 h-16 pointer-events-none -rotate-90">
                <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#b49148" />
                </svg>
            </div>
            <div className="absolute bottom-2 right-2 w-16 h-16 pointer-events-none rotate-180">
                <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#b49148" />
                </svg>
            </div>

            <div className="relative z-10 h-full flex flex-col items-center pt-12 pb-8 px-12 text-center text-[#1e293b]">

                {/* Icon/Logo */}
                <div className="mb-4 text-[#b49148]">
                    <Crown className="w-12 h-12 mx-auto" strokeWidth={1.5} />
                </div>

                {/* Title */}
                <h1 className="text-5xl font-bold uppercase tracking-[0.2em] text-[#b49148] mb-2 drop-shadow-sm">
                    <Editable val={labels.title} k="title" />
                </h1>

                <div className="mb-6"></div>

                {/* Recipient */}
                <p className="text-xl italic text-slate-500 mb-2 font-serif">
                    <Editable val={labels.presentedTo} k="presentedTo" />
                </p>
                <h2 className="text-6xl text-[#b49148] mb-1 px-8 py-2 font-['Dancing_Script'] min-h-[4rem] flex items-center justify-center">
                    {data.recipientName}
                </h2>

                {/* Event Description */}
                <div className="mt-4 mb-6">
                    <p className="text-lg text-slate-500 italic mb-2">
                        <Editable val={labels.eventPrefix} k="eventPrefix" />
                    </p>
                    {customConfig?.visibility?.eventName !== false && (
                        <h3 className="text-3xl font-bold text-slate-800 uppercase tracking-wide max-w-3xl mx-auto leading-tight">
                            {data.eventName}
                        </h3>
                    )}
                </div>

                {/* Footer */}
                <div className="w-full grid grid-cols-3 items-end mt-auto px-4 pb-8"> {/* Added pb-8 for lift */}
                    {/* Left: Entry No & Date */}
                    <div className="text-left font-serif text-slate-700">
                        <p className="text-sm italic mb-1">
                            <Editable val={labels.entryNo} k="entryNo" />
                        </p>
                        <p className="text-sm font-bold">
                            <Editable val={labels.datePrefix} k="datePrefix" />
                        </p>
                    </div>

                    {/* Center: QR */}
                    <div className="flex justify-center">
                        {customConfig?.visibility?.qr !== false && (
                            <div className="bg-white p-1 border border-[#b49148]/30">
                                <img src={data.verifyQR} alt="QR" className="w-20 h-20" />
                            </div>
                        )}
                    </div>

                    {/* Right: Signature */}
                    <div className="text-center">
                        <p className="text-lg font-bold text-[#b49148] uppercase tracking-wide mb-8">
                            <Editable val={labels.signature} k="signature" />
                        </p>
                        <div className="h-12"></div> {/* Reduced height to pull up */}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LuxuryTemplate;

import React from 'react';
import { CertificateTemplateProps } from './types';
import { Cpu, Code, Database } from 'lucide-react';

const TechTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {
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
        title: customConfig?.labels?.title || 'CERTIFICATE',
        presentedTo: customConfig?.labels?.presentedTo || 'Trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã hoàn thành xuất sắc',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp',
        signature: customConfig?.labels?.signature || 'Ban Tổ Chức',
        entryNo: customConfig?.labels?.entryNo || 'ID'
    };

    return (
        <div
            id="certificate-node"
            className="w-[800px] h-[566px] bg-[#0f172a] relative overflow-hidden font-['Outfit'] text-cyan-400 mx-auto shadow-2xl"
            style={{ width: '800px', height: '566px', minWidth: '800px', minHeight: '566px' }}
        >
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
            </div>

            {/* Glowing Orbs */}
            <div className="absolute top-[-100px] left-[-100px] w-60 h-60 bg-purple-500 rounded-full blur-[100px] opacity-30"></div>
            <div className="absolute bottom-[-100px] right-[-100px] w-60 h-60 bg-cyan-500 rounded-full blur-[100px] opacity-30"></div>

            <div className="h-full flex flex-col items-center justify-center p-12 text-center relative z-10 border-2 border-cyan-500/30 m-4 rounded-xl bg-slate-900/50 backdrop-blur-sm">

                <div className="flex gap-4 mb-8 text-cyan-400">
                    <Code className="w-8 h-8" />
                    <Cpu className="w-8 h-8 " />
                    <Database className="w-8 h-8" />
                </div>

                <h1 className="text-5xl font-black mb-6 uppercase tracking-tighter text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                    <Editable val={labels.title} k="title" />
                </h1>

                <div className="w-full max-w-2xl bg-slate-800/80 p-6 rounded-lg border border-cyan-500/50 mb-8 transform -skew-x-12">
                    <div className="transform skew-x-12">
                        <p className="text-slate-400 text-sm mb-2">
                            <Editable val={labels.presentedTo} k="presentedTo" />
                        </p>
                        <h2 className="text-4xl font-bold text-white mb-2">
                            {data.recipientName}
                        </h2>
                    </div>
                </div>

                <p className="text-cyan-200/80 text-lg mb-2">
                    <Editable val={labels.eventPrefix} k="eventPrefix" />
                </p>
                <div className="px-6 py-2 bg-cyan-950/50 rounded border border-cyan-500/30 mb-8 inline-block">
                    <h3 className="text-2xl font-bold text-cyan-300">{data.eventName}</h3>
                </div>

                <div className="w-full flex justify-between items-end mt-auto px-8">
                    <div className="text-left font-mono text-xs text-slate-500">
                        <p><Editable val={labels.entryNo} k="entryNo" />: {data.verifyCode}</p>
                        <p><Editable val={labels.datePrefix} k="datePrefix" />: {data.issuedDate}</p>
                        <p>HASH: {Math.random().toString(36).substring(7)}...</p>
                    </div>

                    {customConfig?.visibility?.qr !== false && (
                        <div className="bg-white p-2 rounded">
                            <img src={data.verifyQR} alt="QR" className="w-20 h-20" />
                        </div>
                    )}

                    <div className="text-right">
                        <div className="text-cyan-400 font-bold text-xl">
                            <Editable val={labels.signature} k="signature" />
                        </div>
                        <div className="text-xs text-purple-400">Authorized Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TechTemplate;

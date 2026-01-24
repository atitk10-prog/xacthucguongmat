import React from 'react';
import { CertificateTemplateProps } from './types';
import { Award, Calendar, CheckCircle, Star } from 'lucide-react';

const ModernTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {
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
        presentedTo: customConfig?.labels?.presentedTo || 'Được trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã hoàn thành xuất sắc nhiệm vụ và yêu cầu của sự kiện',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp',
        signature: customConfig?.labels?.signature || 'EduCheck AI'
    };

    const config = {
        participation: { color: 'text-blue-600', border: 'border-blue-600', bg: 'bg-blue-50', icon: Award },
        completion: { color: 'text-emerald-600', border: 'border-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
        excellent: { color: 'text-amber-600', border: 'border-amber-600', bg: 'bg-amber-50', icon: Star }
    }[data.type];

    const Icon = config.icon;

    return (
        <div
            id="certificate-node"
            className="w-[800px] h-[566px] bg-white relative overflow-hidden font-['Outfit'] mx-auto shadow-2xl"
            style={{ width: '800px', height: '566px', minWidth: '800px', minHeight: '566px' }} // Enforce size
        >
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px]"></div>
            </div>

            {/* Side Accent */}
            <div className={`absolute top-0 left-0 w-4 h-full ${config.bg.replace('bg-', 'bg-gradient-to-b from-white to-')}`}></div>

            <div className="h-full flex flex-col items-center justify-center p-12 text-center relative z-10">
                {/* Header */}
                <div className={`w-20 h-20 ${config.bg} rounded-full flex items-center justify-center mb-6`}>
                    <Icon className={`w-10 h-10 ${config.color}`} />
                </div>

                <h1 className={`text-5xl font-black mb-2 uppercase tracking-wide text-slate-800`}>
                    <Editable val={labels.title} k="title" />
                </h1>

                <div className={`h-1 w-24 ${config.bg.replace('bg-', 'bg-')} mb-8`}></div>

                <p className="text-slate-500 text-lg uppercase tracking-widest mb-4">
                    <Editable val={labels.presentedTo} k="presentedTo" />
                </p>

                <h2 className={`text-4xl font-bold ${config.color} mb-2 italic font-serif`}>
                    {data.recipientName}
                </h2>

                <div className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed mb-8">
                    <p><Editable val={labels.eventPrefix} k="eventPrefix" /></p>
                    <span className="font-bold text-slate-900 text-xl block mt-2">{data.eventName}</span>
                </div>

                {/* Footer */}
                <div className="w-full flex justify-between items-end mt-auto px-12 pb-4">
                    <div className="text-left">
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                            <Calendar className="w-4 h-4" />
                            <Editable val={labels.datePrefix} k="datePrefix" />
                        </div>
                    </div>

                    {customConfig?.visibility?.qr !== false && (
                        <div className="flex flex-col items-center">
                            <img src={data.verifyQR} alt="QR Verify" className="w-20 h-20 border-4 border-white shadow-lg rounded-lg mb-2" />
                            <p className="text-[10px] text-slate-400 font-mono tracking-widest">{data.verifyCode}</p>
                        </div>
                    )}

                    <div className="text-right">
                        <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">Xác nhận bởi</p>
                        <div className="font-signature text-3xl text-slate-800">EduCheck AI</div>
                        <div className={`h-0.5 w-32 ${config.bg.replace('bg-', 'bg-')} mt-1 ml-auto`}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModernTemplate;

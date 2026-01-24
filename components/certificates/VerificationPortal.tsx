import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Certificate, User } from '../../types';
import {
    CheckCircle, AlertCircle, Loader2, Bookmark, Calendar,
    User as UserIcon, Award, ShieldCheck, ExternalLink
} from 'lucide-react';

interface VerificationPortalProps {
    certificateId: string;
}

const VerificationPortal: React.FC<VerificationPortalProps> = ({ certificateId }) => {
    const [loading, setLoading] = useState(true);
    const [certificate, setCertificate] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCertificate = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('certificates')
                    .select('*, user:users(full_name, avatar_url, student_code, organization)')
                    .eq('id', certificateId)
                    .single();

                if (error) throw error;
                if (!data) throw new Error('Không tìm thấy chứng nhận');

                setCertificate(data);

                // Log verification attempt (Mục C)
                await supabase.from('certificate_verifications').insert({
                    certificate_id: certificateId,
                    device_info: navigator.userAgent
                });

            } catch (err: any) {
                console.error('Verification Error:', err);
                setError(err.message || 'Lỗi hệ thống');
            } finally {
                setLoading(false);
            }
        };

        if (certificateId) fetchCertificate();
    }, [certificateId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900">Đang xác thực chứng nhận...</h2>
                    <p className="text-slate-500">Vui lòng chờ trong giây lát</p>
                </div>
            </div>
        );
    }

    if (error || !certificate) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-red-100">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-10 h-10 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 mb-2">Chứng nhận không lệ lệ</h1>
                    <p className="text-slate-500 mb-8">{error || 'Mã chứng nhận này không tồn tại trong hệ thống của chúng tôi.'}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all font-outfit"
                    >
                        Thử lại
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 py-12 px-6">
            <div className="max-w-xl mx-auto">
                {/* Header Badge */}
                <div className="flex justify-center mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-black shadow-sm ring-1 ring-emerald-200">
                        <ShieldCheck className="w-4 h-4" />
                        XÁC THỰC THÀNH CÔNG
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 relative">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-400"></div>

                    <div className="p-10">
                        {/* Title Section */}
                        <div className="text-center mb-10">
                            <div className="w-20 h-20 bg-indigo-50 rounded-[28px] flex items-center justify-center mx-auto mb-6 shadow-indigo-100 shadow-xl">
                                <Award className="w-10 h-10 text-indigo-600" />
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 mb-2 leading-tight">
                                {certificate.title}
                            </h1>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Chứng nhận điện tử</p>
                        </div>

                        {/* Details Grid */}
                        <div className="space-y-6">
                            <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
                                    <UserIcon className="w-6 h-6 text-indigo-500" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Người sở hữu</p>
                                    <h3 className="text-lg font-black text-slate-900 truncate">
                                        {certificate.user?.full_name}
                                    </h3>
                                    <p className="text-sm text-slate-500">
                                        {certificate.user?.student_code} • {certificate.user?.organization}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm mb-3">
                                        <Calendar className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Ngày cấp</p>
                                    <p className="text-sm font-black text-slate-900">
                                        {new Date(certificate.issued_date).toLocaleDateString('vi-VN')}
                                    </p>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm mb-3">
                                        <Bookmark className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Hạng mức</p>
                                    <p className="text-sm font-black text-slate-900 uppercase">
                                        {certificate.type === 'excellent' ? 'Xuất sắc' :
                                            certificate.type === 'completion' ? 'Hoàn thành' : 'Tham gia'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="mt-12 pt-8 border-t border-slate-100">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                                <div className="flex flex-col gap-1">
                                    <span>ID Chứng nhận:</span>
                                    <span className="text-slate-900 font-mono text-[10px]">{certificate.id}</span>
                                </div>
                                <img src="/logo.png" className="h-8 opacity-20 grayscale" alt="App Logo" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Return Home */}
                <div className="text-center mt-8">
                    <p className="text-slate-400 text-sm font-medium mb-4">
                        Chứng nhận này được cấp bởi hệ thống EduCheck.
                    </p>
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 text-indigo-600 font-black text-sm hover:underline"
                    >
                        Trang chủ EduCheck <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default VerificationPortal;

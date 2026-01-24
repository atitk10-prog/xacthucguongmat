import React, { useEffect, useState } from 'react';
import { Award, Calendar, Download, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { User, Certificate } from '../../types';
import { getTemplateComponent } from '../../services/certificateExportService';

interface MyCertificatesProps {
    user: User;
}

export default function MyCertificates({ user }: MyCertificatesProps) {
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;

    useEffect(() => {
        loadCertificates();
    }, [user]);

    const loadCertificates = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await dataService.getCertificates(user.id);
            if (res.success && res.data) {
                setCertificates(res.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(certificates.length / itemsPerPage);
    const paginatedCerts = certificates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handlePreview = (cert: Certificate) => {
        setSelectedCert(cert);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                    <Award className="text-amber-500 w-8 h-8" />
                    Thành Tích & Chứng Nhận
                </h2>
                <div className="bg-amber-50 text-amber-600 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border border-amber-200">
                    Tổng: {certificates.length}
                </div>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold">Đang nạp chứng nhận...</p>
                </div>
            )}

            {!loading && certificates.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Award className="text-slate-300 w-10 h-10" />
                    </div>
                    <h4 className="text-lg font-black text-slate-800">Chưa có chứng nhận nào</h4>
                    <p className="text-slate-400 text-sm mt-1 font-medium">Cố gắng hoàn thành tốt nhiệm vụ để nhận phần thưởng nhé!</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {paginatedCerts.map((cert) => (
                    <div key={cert.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl hover:-translate-y-1 transition-all group">
                        <div className="p-6 flex-1">
                            <div className="flex items-start justify-between mb-4">
                                <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-3.5 rounded-2xl text-white shadow-lg shadow-amber-100 group-hover:rotate-6 transition-transform">
                                    <Award size={28} />
                                </div>
                                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl uppercase tracking-wider border border-slate-100 shadow-sm">
                                    Năm {new Date(cert.issued_date).getFullYear()}
                                </span>
                            </div>
                            <h3 className="font-black text-slate-800 text-xl mb-2 line-clamp-1">{cert.title}</h3>
                            <p className="text-slate-500 text-sm mb-6 line-clamp-2 leading-relaxed font-medium">
                                {cert.metadata?.manualEventName || cert.event_id || 'Thành tích xuất sắc ghi nhận sự nỗ lực và đóng góp tích cực của bạn.'}
                            </p>

                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 mt-auto pt-4 border-t border-slate-50 uppercase tracking-[0.2em]">
                                <Calendar size={12} className="text-indigo-400" />
                                <span>Cấp ngày: {new Date(cert.issued_date).toLocaleDateString('vi-VN')}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-slate-50/50 px-6 py-5 flex gap-3 text-sm border-t border-slate-50 backdrop-blur-sm">
                            <button
                                onClick={() => handlePreview(cert)}
                                className="flex-1 flex items-center justify-center gap-2 bg-white text-indigo-600 font-black hover:bg-indigo-50 border border-indigo-100 shadow-sm py-3 rounded-2xl transition-all active:scale-95"
                            >
                                <Eye size={18} /> Xem ảnh
                            </button>
                            {cert.pdf_url && (
                                <a
                                    href={cert.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 py-3 rounded-2xl transition-all active:scale-95"
                                >
                                    <Download size={18} /> Tải PDF
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-12 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm w-fit mx-auto">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-all border border-slate-100"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex gap-2">
                        {[...Array(totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`w-12 h-12 rounded-2xl font-black transition-all ${currentPage === i + 1
                                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-110'
                                    : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-transparent'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-all border border-slate-100"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {/* Preview Modal */}
            {selectedCert && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl rotate-3">
                                    <Eye size={28} />
                                </div>
                                <div className="ml-2">
                                    <h3 className="text-2xl font-black text-slate-800 leading-tight">Xem trước Chứng nhận</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{selectedCert.title}</span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                        <span className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">Digital Verified</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedCert(null)}
                                className="p-4 hover:bg-red-50 hover:text-red-500 text-slate-300 rounded-3xl transition-all bg-white shadow-sm border border-slate-100"
                            >
                                <X size={28} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-12 flex items-center justify-center bg-slate-100/30 relative">
                            {/* Decorative Background Elements */}
                            <div className="absolute top-10 left-10 w-32 h-32 bg-indigo-400/10 blur-[60px] rounded-full"></div>
                            <div className="absolute bottom-10 right-10 w-40 h-40 bg-amber-400/10 blur-[70px] rounded-full"></div>

                            <div className="transform scale-[0.35] sm:scale-[0.5] md:scale-[0.65] lg:scale-[0.75] xl:scale-[0.85] origin-center shadow-[0_30px_100px_rgba(0,0,0,0.15)] bg-white rounded-lg transition-transform duration-500 hover:scale-[0.37] sm:hover:scale-[0.52] md:hover:scale-[0.67] lg:hover:scale-[0.77] xl:hover:scale-[0.87]">
                                {React.createElement(getTemplateComponent(selectedCert.template_id || 'classic'), {
                                    data: {
                                        recipientName: user.full_name,
                                        title: selectedCert.title,
                                        eventName: selectedCert.metadata?.manualEventName || '',
                                        issuedDate: selectedCert.metadata?.issuedDate || (selectedCert.issued_date ? new Date(selectedCert.issued_date).toLocaleDateString('vi-VN') : ''),
                                        type: selectedCert.type || 'excellent',
                                        verifyCode: selectedCert.id.split('-').pop() || '',
                                        verifyQR: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${selectedCert.id}`
                                    },
                                    customConfig: selectedCert.metadata as any
                                })}
                            </div>

                            {/* Mobile Hint */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-full text-[10px] font-bold text-white uppercase tracking-widest md:hidden">
                                Vuốt/Phóng to để xem chi tiết
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <p className="text-xs text-slate-400 font-medium hidden md:block">
                                Chứng nhận điện tử có giá trị tương đương bản giấy.
                            </p>
                            <div className="flex gap-4 w-full md:w-auto">
                                <button
                                    onClick={() => setSelectedCert(null)}
                                    className="flex-1 md:flex-none px-10 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-100 transition-all shadow-sm"
                                >
                                    Hủy bỏ
                                </button>
                                {selectedCert.pdf_url && (
                                    <a
                                        href={selectedCert.pdf_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 md:flex-none px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 text-center"
                                    >
                                        Tải PDF Ngay
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

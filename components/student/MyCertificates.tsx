import React, { useEffect, useState } from 'react';
import { Award, Calendar, Download, ExternalLink } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { User, Certificate } from '../../types';

interface MyCertificatesProps {
    user: User;
}

export default function MyCertificates({ user }: MyCertificatesProps) {
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCertificates();
    }, [user]);

    const loadCertificates = async () => {
        if (!user) return;
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

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Thành Tích & Chứng Nhận</h2>

            {loading && <div className="text-center text-gray-400 py-8">Đang tải...</div>}

            {!loading && certificates.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Award className="text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">Chưa có chứng nhận nào</p>
                    <p className="text-gray-400 text-sm mt-1">Cố gắng hoàn thành tốt nhiệm vụ nhé!</p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4">
                {certificates.map((cert) => (
                    <div key={cert.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                        <div className="p-4 flex-1">
                            <div className="flex items-start justify-between">
                                <div className="bg-yellow-50 p-2 rounded-lg text-yellow-600 mb-3 inline-block">
                                    <Award size={24} />
                                </div>
                                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                                    {new Date(cert.issued_date).getFullYear()}
                                </span>
                            </div>
                            <h3 className="font-bold text-gray-800 text-lg mb-1">{cert.title}</h3>
                            <p className="text-gray-500 text-sm mb-4 line-clamp-2">
                                {cert.metadata?.description || 'Chứng nhận ghi nhận đóng góp tích cực.'}
                            </p>

                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-auto pt-2 border-t border-gray-50">
                                <Calendar size={12} />
                                <span>Cấp ngày: {new Date(cert.issued_date).toLocaleDateString('vi-VN')}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-gray-50 px-4 py-3 flex gap-3 text-sm">
                            {cert.pdf_url && (
                                <a
                                    href={cert.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 text-blue-600 font-medium hover:bg-white hover:shadow-sm px-2 py-1.5 rounded-lg transition-all"
                                >
                                    <Download size={16} /> Tải về
                                </a>
                            )}
                            <button className="flex-1 flex items-center justify-center gap-2 text-gray-600 font-medium hover:bg-white hover:shadow-sm px-2 py-1.5 rounded-lg transition-all">
                                <ExternalLink size={16} /> Chi tiết
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

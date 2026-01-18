import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { pdfService } from '../../services/pdfService';
import { User, Event, Certificate } from '../../types';

interface CertificateGeneratorProps {
    onBack?: () => void;
}

const CertificateGenerator: React.FC<CertificateGeneratorProps> = ({ onBack }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [events, setEvents] = useState<Event[]>([]);
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const [formData, setFormData] = useState({
        user_id: '',
        event_id: '',
        type: 'participation' as 'participation' | 'completion' | 'excellent',
        title: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersResult, eventsResult, certsResult] = await Promise.all([
                dataService.getUsers({ role: 'student', status: 'active' }),
                dataService.getEvents({ status: 'completed' }),
                dataService.getCertificates()
            ]);

            if (usersResult.success && usersResult.data) setUsers(usersResult.data);
            if (eventsResult.success && eventsResult.data) setEvents(eventsResult.data);
            if (certsResult.success && certsResult.data) setCertificates(certsResult.data);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.user_id || !formData.title) return;

        setIsGenerating(true);
        setResult(null);

        try {
            const response = await dataService.createCertificate({
                user_id: formData.user_id,
                event_id: formData.event_id || undefined,
                type: formData.type,
                title: formData.title
            });

            if (response.success && response.data) {
                setResult({ success: true, message: 'Tạo chứng nhận thành công!' });
                setCertificates(prev => [...prev, response.data!.certificate]);
                setFormData({ user_id: '', event_id: '', type: 'participation', title: '' });
            } else {
                setResult({ success: false, message: response.error || 'Tạo chứng nhận thất bại' });
            }
        } catch (error) {
            setResult({ success: false, message: 'Có lỗi xảy ra' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = (cert: Certificate) => {
        const user = users.find(u => u.id === cert.user_id);
        const event = events.find(e => e.id === cert.event_id);

        pdfService.generateCertificate({
            userName: user?.full_name || 'Học sinh',
            eventName: event?.name || cert.title,
            date: cert.issued_date,
            certificateId: cert.id,
            type: cert.type,
            qrCode: cert.qr_verify
        });
    };

    const getTypeLabel = (type: string) => {
        const labels: Record<string, { text: string; color: string }> = {
            participation: { text: 'Tham gia', color: 'bg-blue-100 text-blue-600' },
            completion: { text: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-600' },
            excellent: { text: 'Xuất sắc', color: 'bg-amber-100 text-amber-600' }
        };
        return labels[type] || labels.participation;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">📜 Giấy chứng nhận</h2>
                    <p className="text-slate-500 font-medium mt-1">Tạo và quản lý giấy chứng nhận</p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                        ← Quay lại
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-black text-slate-900 mb-6">Tạo chứng nhận mới</h3>

                    <form onSubmit={handleGenerate} className="space-y-5">
                        {/* User Selection */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Người nhận <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.user_id}
                                onChange={e => setFormData({ ...formData, user_id: e.target.value })}
                                required
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">-- Chọn người nhận --</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>{user.full_name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Event Selection */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Sự kiện liên quan
                            </label>
                            <select
                                value={formData.event_id}
                                onChange={e => setFormData({ ...formData, event_id: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">-- Không có --</option>
                                {events.map(event => (
                                    <option key={event.id} value={event.id}>{event.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Type */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Loại chứng nhận <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                {(['participation', 'completion', 'excellent'] as const).map(type => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type })}
                                        className={`p-3 rounded-xl text-center transition-all ${formData.type === type
                                                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                            }`}
                                    >
                                        <span className="text-2xl">{type === 'participation' ? '🎫' : type === 'completion' ? '🏅' : '🏆'}</span>
                                        <p className="text-xs font-bold mt-1">{getTypeLabel(type).text}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Tiêu đề <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                required
                                placeholder="VD: Chứng nhận hoàn thành khóa học"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isGenerating}
                            className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${isGenerating
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                        >
                            {isGenerating ? 'ĐANG TẠO...' : '📜 TẠO CHỨNG NHẬN'}
                        </button>
                    </form>

                    {result && (
                        <div className={`mt-4 p-4 rounded-2xl ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {result.message}
                        </div>
                    )}
                </div>

                {/* Certificates List */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-black text-slate-900 mb-6">Danh sách chứng nhận ({certificates.length})</h3>

                    {certificates.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <span className="text-5xl">📜</span>
                            <p className="mt-4">Chưa có chứng nhận nào</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {certificates.map(cert => {
                                const user = users.find(u => u.id === cert.user_id);
                                return (
                                    <div key={cert.id} className="bg-slate-50 rounded-2xl p-4">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-900">{cert.title}</p>
                                                <p className="text-sm text-slate-500">{user?.full_name || 'Không xác định'}</p>
                                                <div className="flex gap-2 mt-2">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTypeLabel(cert.type).color}`}>
                                                        {getTypeLabel(cert.type).text}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${cert.status === 'issued' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                                                        }`}>
                                                        {cert.status === 'issued' ? 'Đã cấp' : 'Đã thu hồi'}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDownload(cert)}
                                                className="px-3 py-2 bg-indigo-100 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-200"
                                            >
                                                📥 Tải PDF
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CertificateGenerator;

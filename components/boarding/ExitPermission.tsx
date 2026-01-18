import React, { useState } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';

interface ExitPermissionProps {
    currentUser?: User;
    onBack?: () => void;
}

interface PermissionRequest {
    id: string;
    reason: string;
    exit_time: string;
    return_time: string;
    destination: string;
    parent_contact: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
}

const ExitPermission: React.FC<ExitPermissionProps> = ({ currentUser, onBack }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [formData, setFormData] = useState({
        reason: '',
        exit_time: '',
        return_time: '',
        destination: '',
        parent_contact: ''
    });

    // Mock previous requests (in real app, fetch from API)
    const [requests] = useState<PermissionRequest[]>([
        {
            id: '1',
            reason: 'Về nhà cuối tuần',
            exit_time: '2024-01-12T16:00',
            return_time: '2024-01-14T19:00',
            destination: 'Nhà ở Hà Nội',
            parent_contact: '0987654321',
            status: 'approved',
            created_at: '2024-01-10'
        }
    ]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setIsSubmitting(true);
        setResult(null);

        try {
            // In real implementation, call API to create permission request
            await new Promise(resolve => setTimeout(resolve, 1500));

            setResult({
                success: true,
                message: 'Đơn xin phép đã được gửi. Vui lòng chờ phê duyệt.'
            });

            // Reset form
            setFormData({
                reason: '',
                exit_time: '',
                return_time: '',
                destination: '',
                parent_contact: ''
            });
        } catch (error) {
            setResult({
                success: false,
                message: 'Có lỗi xảy ra. Vui lòng thử lại.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusBadge = (status: PermissionRequest['status']) => {
        const badges = {
            pending: { text: '⏳ Chờ duyệt', class: 'bg-amber-100 text-amber-600' },
            approved: { text: '✅ Đã duyệt', class: 'bg-emerald-100 text-emerald-600' },
            rejected: { text: '❌ Từ chối', class: 'bg-red-100 text-red-600' }
        };
        return badges[status];
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">📝 Xin phép ra ngoài</h2>
                    <p className="text-slate-500 font-medium mt-1">Gửi đơn xin phép ra khỏi khu nội trú</p>
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
                    <h3 className="text-lg font-black text-slate-900 mb-6">Tạo đơn mới</h3>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Reason */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Lý do <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.reason}
                                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                required
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">-- Chọn lý do --</option>
                                <option value="about_home">Về nhà cuối tuần</option>
                                <option value="medical">Khám bệnh / Y tế</option>
                                <option value="family">Việc gia đình</option>
                                <option value="school_event">Sự kiện trường</option>
                                <option value="other">Lý do khác</option>
                            </select>
                        </div>

                        {/* Exit Time */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Thời gian ra <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={formData.exit_time}
                                    onChange={e => setFormData({ ...formData, exit_time: e.target.value })}
                                    required
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Thời gian về <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={formData.return_time}
                                    onChange={e => setFormData({ ...formData, return_time: e.target.value })}
                                    required
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        {/* Destination */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Địa điểm đến <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.destination}
                                onChange={e => setFormData({ ...formData, destination: e.target.value })}
                                required
                                placeholder="VD: Nhà ở Quận 1, TP.HCM"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Parent Contact */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                SĐT Phụ huynh <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                value={formData.parent_contact}
                                onChange={e => setFormData({ ...formData, parent_contact: e.target.value })}
                                required
                                placeholder="0987654321"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${isSubmitting
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ĐANG GỬI...
                                </span>
                            ) : (
                                'GỬI ĐƠN XIN PHÉP'
                            )}
                        </button>
                    </form>

                    {/* Result */}
                    {result && (
                        <div className={`mt-4 p-4 rounded-2xl ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {result.message}
                        </div>
                    )}
                </div>

                {/* Previous Requests */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-black text-slate-900 mb-6">Lịch sử đơn xin phép</h3>

                    {requests.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <span className="text-5xl">📋</span>
                            <p className="mt-4">Chưa có đơn xin phép nào</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {requests.map(req => (
                                <div key={req.id} className="bg-slate-50 rounded-2xl p-4">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="font-bold text-slate-900">{req.reason}</p>
                                            <p className="text-sm text-slate-500">{req.destination}</p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusBadge(req.status).class}`}>
                                            {getStatusBadge(req.status).text}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 text-xs text-slate-500">
                                        <span>🚪 Ra: {new Date(req.exit_time).toLocaleString('vi-VN')}</span>
                                        <span>🏠 Về: {new Date(req.return_time).toLocaleString('vi-VN')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExitPermission;

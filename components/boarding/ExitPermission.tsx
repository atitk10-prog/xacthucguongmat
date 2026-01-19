import React, { useState } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import { Icons } from '../ui';

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

// Reusable Time Picker Component (Same as in BoardingConfigPage)
const CustomTimePicker = ({ value, onChange, className = '' }: { value: string, onChange: (val: string) => void, className?: string }) => {
    // Value is HH:mm (24h) or empty
    const [hour24, minute] = value ? value.split(':').map(Number) : [0, 0];
    const hour12 = hour24 % 12 || 12;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';

    const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        let newHour = parseInt(e.target.value);
        if (ampm === 'PM' && newHour !== 12) newHour += 12;
        if (ampm === 'AM' && newHour === 12) newHour = 0;
        onChange(`${newHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    };

    const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(`${hour24.toString().padStart(2, '0')}:${e.target.value}`);
    };

    const handleAmPmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newAmpm = e.target.value;
        let newHour = hour24;
        if (newAmpm === 'PM' && newHour < 12) newHour += 12;
        if (newAmpm === 'AM' && newHour >= 12) newHour -= 12;
        onChange(`${newHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    };

    const selectClass = "bg-slate-50 border border-slate-200 rounded-lg px-2 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-slate-100 cursor-pointer text-center appearance-none";

    return (
        <div className={`flex items-center gap-1 ${className}`}>
            <div className="relative">
                <select value={hour12} onChange={handleHourChange} className={`${selectClass} w-16`}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                        <option key={h} value={h}>{h.toString().padStart(2, '0')}</option>
                    ))}
                </select>
            </div>
            <span className="text-slate-400 font-bold">:</span>
            <div className="relative">
                <select value={minute.toString().padStart(2, '0')} onChange={handleMinuteChange} className={`${selectClass} w-16`}>
                    {Array.from({ length: 60 }, (_, i) => i).map(m => (
                        <option key={m} value={m.toString().padStart(2, '0')}>{m.toString().padStart(2, '0')}</option>
                    ))}
                </select>
            </div>
            <div className="relative ml-1">
                <select value={ampm} onChange={handleAmPmChange} className={`${selectClass} w-20 bg-indigo-50 text-indigo-700 border-indigo-100`}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                </select>
            </div>
        </div>
    );
};


const ExitPermission: React.FC<ExitPermissionProps> = ({ currentUser, onBack }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    // Split state for easier handling
    const [formData, setFormData] = useState({
        reason: '',
        destination: '',
        parent_contact: '',
        exit_date: new Date().toISOString().split('T')[0],
        exit_time: '07:00',
        return_date: new Date().toISOString().split('T')[0],
        return_time: '17:00'
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

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        // Format time as hh:mm AM/PM
        const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        // Format date as dd/MM/yyyy
        const day = date.toLocaleDateString('vi-VN');
        return `${time} ${day}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setIsSubmitting(true);
        setResult(null);

        // Combine Date & Time
        const fullExitTime = `${formData.exit_date}T${formData.exit_time}`;
        const fullReturnTime = `${formData.return_date}T${formData.return_time}`;

        // Basic Validation
        if (new Date(fullExitTime) >= new Date(fullReturnTime)) {
            setResult({
                success: false,
                message: 'Thời gian về phải sau thời gian ra.'
            });
            setIsSubmitting(false);
            return;
        }

        try {
            // Simulate API Call
            console.log('Submitting:', { ...formData, fullExitTime, fullReturnTime });
            await new Promise(resolve => setTimeout(resolve, 1500));

            setResult({
                success: true,
                message: 'Đơn xin phép đã được gửi. Vui lòng chờ phê duyệt.'
            });

            // Reset Form
            setFormData({
                reason: '',
                destination: '',
                parent_contact: '',
                exit_date: new Date().toISOString().split('T')[0],
                exit_time: '07:00',
                return_date: new Date().toISOString().split('T')[0],
                return_time: '17:00'
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
        switch (status) {
            case 'pending':
                return {
                    text: 'Chờ duyệt',
                    class: 'bg-amber-100 text-amber-700',
                    icon: <Icons.Clock className="w-4 h-4" />
                };
            case 'approved':
                return {
                    text: 'Đã duyệt',
                    class: 'bg-emerald-100 text-emerald-700',
                    icon: <Icons.CheckCircle className="w-4 h-4" />
                };
            case 'rejected':
                return {
                    text: 'Từ chối',
                    class: 'bg-red-100 text-red-700',
                    icon: <Icons.XCircle className="w-4 h-4" />
                };
            default:
                return { text: '', class: '', icon: null };
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Icons.FileText className="w-8 h-8 text-indigo-600" />
                        Xin phép ra ngoài
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Gửi đơn xin phép ra khỏi khu nội trú</p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                        <Icons.ChevronLeft className="w-5 h-5 inline-block mr-1" /> Quay lại
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                        <Icons.Plus className="w-5 h-5 text-indigo-600" />
                        Tạo đơn mới
                    </h3>

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
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                            <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center gap-2">
                                <Icons.Exit className="w-4 h-4 text-slate-500" /> Thời gian đi
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Ngày đi</label>
                                    <input
                                        type="date"
                                        value={formData.exit_date}
                                        onChange={e => setFormData({ ...formData, exit_date: e.target.value })}
                                        required
                                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Giờ đi</label>
                                    <CustomTimePicker
                                        value={formData.exit_time}
                                        onChange={val => setFormData({ ...formData, exit_time: val })}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Return Time */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                            <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center gap-2">
                                <Icons.Home className="w-4 h-4 text-slate-500" /> Thời gian về
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Ngày về</label>
                                    <input
                                        type="date"
                                        value={formData.return_date}
                                        onChange={e => setFormData({ ...formData, return_date: e.target.value })}
                                        required
                                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Giờ về</label>
                                    <CustomTimePicker
                                        value={formData.return_time}
                                        onChange={val => setFormData({ ...formData, return_time: val })}
                                        className="w-full"
                                    />
                                </div>
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
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                        <Icons.Calendar className="w-5 h-5 text-indigo-600" />
                        Lịch sử đơn xin phép
                    </h3>

                    {requests.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Icons.FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="mt-4">Chưa có đơn xin phép nào</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {requests.map(req => {
                                const badge = getStatusBadge(req.status);
                                return (
                                    <div key={req.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="font-bold text-slate-900">{req.reason}</p>
                                                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                                                    <Icons.Home className="w-3 h-3" /> {req.destination}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${badge.class}`}>
                                                {badge.icon}
                                                {badge.text}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-2 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                                            <span className="flex items-center gap-2">
                                                <Icons.Exit className="w-3.5 h-3.5 text-slate-400" />
                                                Ra: <span className="font-mono text-slate-700">{formatTime(req.exit_time)}</span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <Icons.Home className="w-3.5 h-3.5 text-slate-400" />
                                                Về: <span className="font-mono text-slate-700">{formatTime(req.return_time)}</span>
                                            </span>
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

export default ExitPermission;

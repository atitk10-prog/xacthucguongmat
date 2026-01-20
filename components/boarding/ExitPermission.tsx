import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import { Icons, useToast } from '../ui';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ExitPermissionProps {
    currentUser?: User;
    onBack?: () => void;
}

interface PermissionRequest {
    id: string;
    user_id: string;
    reason: string;
    reason_detail?: string;
    destination: string;
    parent_contact?: string;
    exit_time: string;
    return_time: string;
    status: 'pending' | 'approved' | 'rejected';
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    created_at: string;
    user?: {
        full_name: string;
        student_code: string;
        organization: string;
    };
}

// Reusable Time Picker Component
const CustomTimePicker = ({ value, onChange, className = '' }: { value: string, onChange: (val: string) => void, className?: string }) => {
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
    const { success: toastSuccess, error: toastError } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [requests, setRequests] = useState<PermissionRequest[]>([]);
    const [allPendingRequests, setAllPendingRequests] = useState<PermissionRequest[]>([]);

    // Admin mode
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'teacher';
    const [viewMode, setViewMode] = useState<'student' | 'admin'>('student');
    const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        reason: '',
        destination: '',
        parent_contact: '',
        exit_date: new Date().toISOString().split('T')[0],
        exit_time: '07:00',
        return_date: new Date().toISOString().split('T')[0],
        return_time: '17:00'
    });

    // Load existing requests on mount
    useEffect(() => {
        loadRequests();
        if (isAdmin) {
            loadAllPendingRequests();
        }
    }, [currentUser]);

    const loadRequests = async () => {
        setIsLoading(true);
        try {
            const options = currentUser ? { userId: currentUser.id } : {};
            const res = await dataService.getExitPermissions(options);
            if (res.success && res.data) {
                setRequests(res.data as PermissionRequest[]);
            }
        } catch (err) {
            console.error('Failed to load requests:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAllPendingRequests = async () => {
        try {
            const res = await dataService.getExitPermissions({ status: 'pending' });
            if (res.success && res.data) {
                setAllPendingRequests(res.data as PermissionRequest[]);
            }
        } catch (err) {
            console.error('Failed to load pending requests:', err);
        }
    };

    const handleApprove = async (id: string) => {
        if (!currentUser) return;
        const res = await dataService.approveRejectExitPermission(id, 'approved', currentUser.id);
        if (res.success) {
            toastSuccess('Đã duyệt đơn xin phép!');
            loadAllPendingRequests();
            loadRequests();
        } else {
            toastError(res.error || 'Lỗi duyệt đơn');
        }
    };

    const handleReject = async (id: string) => {
        if (!currentUser) return;
        const res = await dataService.approveRejectExitPermission(
            id,
            'rejected',
            currentUser.id,
            rejectionReason || 'Không đạt yêu cầu'
        );
        if (res.success) {
            toastSuccess('Đã từ chối đơn!');
            setShowRejectModal(null);
            setRejectionReason('');
            loadAllPendingRequests();
            loadRequests();
        } else {
            toastError(res.error || 'Lỗi từ chối đơn');
        }
    };

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const day = date.toLocaleDateString('vi-VN');
        return `${time} ${day}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) {
            toastError('Vui lòng đăng nhập để gửi đơn');
            return;
        }

        setIsSubmitting(true);

        // Combine Date & Time
        const fullExitTime = `${formData.exit_date}T${formData.exit_time}:00`;
        const fullReturnTime = `${formData.return_date}T${formData.return_time}:00`;

        // Validation
        if (new Date(fullExitTime) >= new Date(fullReturnTime)) {
            toastError('Thời gian về phải sau thời gian ra');
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await dataService.createExitPermission({
                user_id: currentUser.id,
                reason: formData.reason,
                destination: formData.destination,
                parent_contact: formData.parent_contact,
                exit_time: fullExitTime,
                return_time: fullReturnTime
            });

            if (res.success) {
                toastSuccess('Đã gửi đơn xin phép thành công!');
                // Reset form
                setFormData({
                    reason: '',
                    destination: '',
                    parent_contact: '',
                    exit_date: new Date().toISOString().split('T')[0],
                    exit_time: '07:00',
                    return_date: new Date().toISOString().split('T')[0],
                    return_time: '17:00'
                });
                // Reload requests
                loadRequests();
                if (isAdmin) {
                    loadAllPendingRequests();
                }
            } else {
                toastError(res.error || 'Lỗi gửi đơn');
            }
        } catch (error) {
            toastError('Có lỗi xảy ra');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRequest = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa đơn này?')) return;

        const res = await dataService.deleteExitPermission(id);
        if (res.success) {
            toastSuccess('Đã xóa đơn');
            setRequests(prev => prev.filter(r => r.id !== id));
        } else {
            toastError(res.error || 'Lỗi xóa đơn');
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

    const getReasonLabel = (reason: string) => {
        const labels: Record<string, string> = {
            'about_home': 'Về nhà cuối tuần',
            'medical': 'Khám bệnh / Y tế',
            'family': 'Việc gia đình',
            'school_event': 'Sự kiện trường',
            'other': 'Lý do khác'
        };
        return labels[reason] || reason;
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
                    {isAdmin ? (
                        <div className="flex bg-slate-100 p-1 rounded-lg mt-2 w-fit">
                            <button
                                onClick={() => setViewMode('student')}
                                className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${viewMode === 'student' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                            >
                                Cá nhân
                            </button>
                            <button
                                onClick={() => setViewMode('admin')}
                                className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${viewMode === 'admin' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                            >
                                Quản lý ({allPendingRequests.length})
                            </button>
                            {isAdmin && viewMode === 'admin' && (
                                <button
                                    onClick={() => { loadAllPendingRequests(); toastSuccess('Đã làm mới dữ liệu'); }}
                                    className="ml-2 p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-white transition-all"
                                    title="Làm mới"
                                >
                                    <Icons.Clock className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <p className="text-slate-500 font-medium mt-1">Gửi đơn xin phép ra khỏi khu nội trú</p>
                    )}
                </div>
                {onBack && (
                    <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                        <Icons.ChevronLeft className="w-5 h-5 inline-block mr-1" /> Quay lại
                    </button>
                )}
            </div>

            {viewMode === 'admin' ? (
                // Admin View
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-indigo-600" />
                        Danh sách chờ duyệt
                    </h3>

                    {allPendingRequests.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-20" />
                            <p className="font-medium">Không có đơn nào đang chờ duyệt</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {allPendingRequests.map(req => (
                                <div key={req.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="font-bold text-slate-900 text-lg">{req.user?.full_name}</p>
                                            <p className="text-sm text-indigo-600 font-medium">{req.user?.organization} - {req.user?.student_code}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowRejectModal(req.id)}
                                                className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-bold text-sm hover:bg-red-200"
                                            >
                                                Từ chối
                                            </button>
                                            <button
                                                onClick={() => handleApprove(req.id)}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm hover:bg-emerald-200"
                                            >
                                                Duyệt
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <div className="space-y-2">
                                            <p><span className="text-slate-500 font-bold">Lý do:</span> {getReasonLabel(req.reason)}</p>
                                            <p><span className="text-slate-500 font-bold">Nơi đến:</span> {req.destination}</p>
                                            <p><span className="text-slate-500 font-bold">Liên hệ:</span> {req.parent_contact}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <p><span className="text-slate-500 font-bold">Giờ đi:</span> {formatDateTime(req.exit_time)}</p>
                                            <p><span className="text-slate-500 font-bold">Giờ về:</span> {formatDateTime(req.return_time)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
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
                    </div>

                    {/* Previous Requests */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                        <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                            <Icons.Calendar className="w-5 h-5 text-indigo-600" />
                            Lịch sử đơn xin phép
                            {requests.length > 0 && (
                                <span className="ml-auto text-sm font-bold bg-slate-100 px-2 py-1 rounded-lg text-slate-600">
                                    {requests.length} đơn
                                </span>
                            )}
                        </h3>

                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <Icons.FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <p className="mt-4">Chưa có đơn xin phép nào</p>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[500px] overflow-y-auto">
                                {requests.map(req => {
                                    const badge = getStatusBadge(req.status);
                                    return (
                                        <div key={req.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative group">
                                            {/* Delete button for pending requests */}
                                            {req.status === 'pending' && (
                                                <button
                                                    onClick={() => handleDeleteRequest(req.id)}
                                                    className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Xóa đơn"
                                                >
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                            )}

                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <p className="font-bold text-slate-900">{getReasonLabel(req.reason)}</p>
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
                                                    Ra: <span className="font-mono text-slate-700">{formatDateTime(req.exit_time)}</span>
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <Icons.Home className="w-3.5 h-3.5 text-slate-400" />
                                                    Về: <span className="font-mono text-slate-700">{formatDateTime(req.return_time)}</span>
                                                </span>
                                            </div>
                                            {req.rejection_reason && (
                                                <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
                                                    <p className="text-xs text-red-600 font-medium">
                                                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                                                        Lý do từ chối: {req.rejection_reason}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6">
                        <h3 className="text-lg font-black text-slate-900 mb-4">Lý do từ chối</h3>
                        <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[100px]"
                            placeholder="Nhập lý do từ chối..."
                            autoFocus
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => { setShowRejectModal(null); setRejectionReason(''); }}
                                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={() => handleReject(showRejectModal)}
                                className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700"
                            >
                                Xác nhận từ chối
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExitPermission;

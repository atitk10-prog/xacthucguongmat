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
    const [allRequests, setAllRequests] = useState<PermissionRequest[]>([]);
    const [allPendingRequests, setAllPendingRequests] = useState<PermissionRequest[]>([]);

    // Admin mode
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'teacher';
    const [viewMode, setViewMode] = useState<'student' | 'admin'>(isAdmin ? 'admin' : 'student');
    const [adminTab, setAdminTab] = useState<'pending' | 'history'>('pending');
    const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

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
            loadAdminData();
        }

        // Subscribe to real-time changes
        const channel = dataService.subscribeToExitPermissions((payload) => {
            // Reload all relevant data when any change occurs
            loadRequests();
            if (isAdmin) loadAdminData();

            // If student and their request status changed, toast them
            if (!isAdmin && payload.eventType === 'UPDATE' && payload.new.user_id === currentUser?.id) {
                const newStatus = payload.new.status;
                if (newStatus === 'approved') toastSuccess('Đơn xin phép của bạn đã được DUYỆT! 🎉');
                else if (newStatus === 'rejected') toastError('Đơn xin phép của bạn đã bị từ chối.');
            }
        });

        return () => {
            if (channel) channel.unsubscribe();
        };
    }, [currentUser, adminTab]);

    const loadAdminData = async () => {
        if (adminTab === 'pending') {
            loadAllPendingRequests();
        } else {
            loadAllHistoryRequests();
        }
    };

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

    const loadAllHistoryRequests = async () => {
        try {
            // Fetch all non-pending
            const res = await dataService.getExitPermissions();
            if (res.success && res.data) {
                const history = (res.data as PermissionRequest[]).filter(r => r.status !== 'pending');
                setAllRequests(history);
            }
        } catch (err) {
            console.error('Failed to load history requests:', err);
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
            loadAdminData();
            loadRequests();
        } else {
            toastError(res.error || 'Lỗi từ chối đơn');
        }
    };

    const formatDateTime = (dateString: string) => {
        if (!dateString) return '---';
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

        const fullExitTime = `${formData.exit_date}T${formData.exit_time}:00`;
        const fullReturnTime = `${formData.return_date}T${formData.return_time}:00`;

        if (new Date(fullExitTime) >= new Date(fullReturnTime)) {
            toastError('Thời gian về phải sau thời gian ra');
            setIsSubmitting(false);
            return;
        }

        try {
            const payload = {
                user_id: currentUser.id,
                reason: formData.reason,
                destination: formData.destination,
                parent_contact: formData.parent_contact,
                exit_time: fullExitTime,
                return_time: fullReturnTime
            };

            const res = isEditing && editingId
                ? await dataService.updateExitPermission(editingId, payload)
                : await dataService.createExitPermission(payload);

            if (res.success) {
                toastSuccess(isEditing ? 'Cập nhật đơn thành công!' : 'Đã gửi đơn xin phép thành công!');
                handleCancelEdit();
                loadRequests();
                if (isAdmin) loadAdminData();
            } else {
                toastError(res.error || 'Lỗi xử lý đơn');
            }
        } catch (error) {
            toastError('Có lỗi xảy ra');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditClick = (req: PermissionRequest) => {
        const exitDateObj = new Date(req.exit_time);
        const returnDateObj = new Date(req.return_time);

        setFormData({
            reason: req.reason,
            destination: req.destination,
            parent_contact: req.parent_contact || '',
            exit_date: exitDateObj.toISOString().split('T')[0],
            exit_time: exitDateObj.toTimeString().split(' ')[0].substring(0, 5),
            return_date: returnDateObj.toISOString().split('T')[0],
            return_time: returnDateObj.toTimeString().split(' ')[0].substring(0, 5)
        });
        setEditingId(req.id);
        setIsEditing(true);
        // Scroll to top or form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setFormData({
            reason: '',
            destination: '',
            parent_contact: '',
            exit_date: new Date().toISOString().split('T')[0],
            exit_time: '07:00',
            return_date: new Date().toISOString().split('T')[0],
            return_time: '17:00'
        });
        setIsEditing(false);
        setEditingId(null);
    };

    const handleDeleteRequest = async (id: string) => {
        if (!id) return;
        const res = await dataService.deleteExitPermission(id);
        if (res.success) {
            toastSuccess('Đã xóa đơn');
            setRequests(prev => prev.filter(r => r.id !== id));
            setAllPendingRequests(prev => prev.filter(r => r.id !== id));
            setAllRequests(prev => prev.filter(r => r.id !== id));
            setShowDeleteConfirm(null);
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
                                    onClick={() => { loadAdminData(); toastSuccess('Đã làm mới dữ liệu'); }}
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
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="flex border-b border-slate-100">
                        <button
                            onClick={() => setAdminTab('pending')}
                            className={`flex-1 py-4 text-sm font-black flex items-center justify-center gap-2 border-b-2 transition-all ${adminTab === 'pending' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            <Icons.Clock className="w-4 h-4" />
                            CHỜ DUYỆT ({allPendingRequests.length})
                        </button>
                        <button
                            onClick={() => setAdminTab('history')}
                            className={`flex-1 py-4 text-sm font-black flex items-center justify-center gap-2 border-b-2 transition-all ${adminTab === 'history' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            <Icons.Calendar className="w-4 h-4" />
                            LỊCH SỬ DUYỆT
                        </button>
                    </div>

                    <div className="p-6">
                        {adminTab === 'pending' ? (
                            <div className="space-y-4">
                                <h3 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-indigo-600" />
                                    Đang chờ xử lý
                                </h3>
                                {allPendingRequests.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400">
                                        <CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="font-medium">Sạch sẽ! Không có đơn nào chờ duyệt.</p>
                                    </div>
                                ) : (
                                    allPendingRequests.map(req => (
                                        <div key={req.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative group">
                                            <button
                                                onClick={() => setShowDeleteConfirm(req.id)}
                                                className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Xóa đơn"
                                            >
                                                <Icons.Trash className="w-4 h-4" />
                                            </button>
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
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4 border-t border-slate-200 pt-4">
                                                <div className="space-y-2">
                                                    <p><span className="text-slate-500 font-bold">Lý do:</span> {getReasonLabel(req.reason)}</p>
                                                    <p><span className="text-slate-500 font-bold">Nơi đến:</span> {req.destination}</p>
                                                    <p><span className="text-slate-500 font-bold">Liên hệ:</span> {req.parent_contact}</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="flex items-center gap-2"><Icons.Exit className="w-3.5 h-3.5 text-slate-400" /> <span className="text-slate-500 font-bold">Giờ đi:</span> {formatDateTime(req.exit_time)}</p>
                                                    <p className="flex items-center gap-2"><Icons.Home className="w-3.5 h-3.5 text-slate-400" /> <span className="text-slate-500 font-bold">Giờ về:</span> {formatDateTime(req.return_time)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
                                    <Icons.Calendar className="w-5 h-5 text-indigo-600" />
                                    Lịch sử đã duyệt/từ chối
                                </h3>
                                {allRequests.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400">
                                        <Icons.Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="font-medium">Chưa có lịch sử</p>
                                    </div>
                                ) : (
                                    allRequests.map(req => {
                                        const badge = getStatusBadge(req.status);
                                        return (
                                            <div key={req.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative group">
                                                <button
                                                    onClick={() => setShowDeleteConfirm(req.id)}
                                                    className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Xóa đơn"
                                                >
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="font-bold text-slate-800">{req.user?.full_name}</p>
                                                        <p className="text-xs text-slate-500">{req.user?.organization} - {req.user?.student_code}</p>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${badge.class}`}>
                                                        {badge.icon}
                                                        {badge.text}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-[11px] mt-2 text-slate-600">
                                                    <p><span className="font-bold">Lý do:</span> {getReasonLabel(req.reason)}</p>
                                                    <p><span className="font-bold">Ra:</span> {formatDateTime(req.exit_time)}</p>
                                                    <p><span className="font-bold">Đến:</span> {req.destination}</p>
                                                    <p><span className="font-bold">Về:</span> {formatDateTime(req.return_time)}</p>
                                                </div>
                                                {req.rejection_reason && (
                                                    <div className="mt-2 text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 font-medium">
                                                        Lý do từ chối: {req.rejection_reason}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Form */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                        <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Icons.Plus className="w-5 h-5 text-indigo-600" />
                                {isEditing ? 'Cập nhật đơn' : 'Tạo đơn mới'}
                            </span>
                            {isEditing && (
                                <button
                                    onClick={handleCancelEdit}
                                    className="text-xs text-red-500 hover:underline font-bold"
                                >
                                    HỦY CHỈNH SỬA
                                </button>
                            )}
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
                                className={`w-full py-4 rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 transition-all ${isSubmitting
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ĐANG XỬ LÝ...
                                    </span>
                                ) : (
                                    isEditing ? 'CẬP NHẬT ĐƠN XIN PHÉP' : 'GỬI ĐƠN XIN PHÉP'
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
                                        <div key={req.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative group hover:border-indigo-200 transition-all">
                                            {/* Action buttons for pending requests */}
                                            {req.status === 'pending' && (
                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button
                                                        onClick={() => handleEditClick(req)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                        title="Sửa đơn"
                                                    >
                                                        <Icons.Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setShowDeleteConfirm(req.id)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                        title="Xóa đơn"
                                                    >
                                                        <Icons.Trash className="w-4 h-4" />
                                                    </button>
                                                </div>
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <XCircle className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-center text-slate-900 mb-2">Từ chối đơn</h3>
                        <p className="text-slate-500 text-center mb-6">Vui lòng cung cấp lý do để học sinh được biết.</p>

                        <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] mb-6 font-medium"
                            placeholder="VD: Thông tin chưa chính xác..."
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowRejectModal(null); setRejectionReason(''); }}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
                            >
                                HỦY BỎ
                            </button>
                            <button
                                onClick={() => handleReject(showRejectModal)}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                            >
                                XÁC NHẬN
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Icons.Trash className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-center text-slate-900 mb-2">Bạn chắc chắn?</h3>
                        <p className="text-slate-500 text-center mb-8 font-medium">Hành động này không thể hoàn tác. Đơn xin phép sẽ bị xóa vĩnh viễn.</p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
                            >
                                HỦY
                            </button>
                            <button
                                onClick={() => handleDeleteRequest(showDeleteConfirm)}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                            >
                                XÓA NGAY
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExitPermission;

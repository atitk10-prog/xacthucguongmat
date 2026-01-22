import React, { useEffect, useState } from 'react';
import { Plus, Clock, MapPin, CheckCircle, XCircle, AlertCircle, Edit, Trash2, Trash, Calendar, ChevronLeft } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useToast } from '../ui';

export default function LeaveRequestManager() {
    const { success: toastSuccess, error: toastError } = useToast();
    const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const user = dataService.getStoredUser();

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        destination: '',
        reason: '',
        exit_time: '',
        return_time: '',
        parent_contact: ''
    });

    useEffect(() => {
        if (activeTab === 'list') {
            loadRequests();
        }
    }, [activeTab]);

    const loadRequests = async () => {
        if (!user) return;
        setLoading(true);
        const res = await dataService.getExitPermissions({ userId: user.id });
        if (res.success && res.data) {
            setRequests(res.data);
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (!formData.destination || !formData.reason || !formData.exit_time || !formData.return_time) {
            toastError('Vui lòng điền đầy đủ thông tin');
            return;
        }

        setIsSubmitting(true);

        try {
            const payload = {
                user_id: user.id,
                ...formData
            };

            const res = isEditing && editingId
                ? await dataService.updateExitPermission(editingId, payload)
                : await dataService.createExitPermission(payload);

            if (res.success) {
                toastSuccess(isEditing ? 'Đã cập nhật đơn thành công!' : 'Gửi đơn thành công!');
                setFormData({
                    destination: '',
                    reason: '',
                    exit_time: '',
                    return_time: '',
                    parent_contact: ''
                });
                setIsEditing(false);
                setEditingId(null);
                setActiveTab('list');
            } else {
                toastError('Lỗi: ' + res.error);
            }
        } catch (error) {
            toastError('Có lỗi xảy ra khi xử lý đơn');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditClick = (req: any) => {
        setFormData({
            destination: req.destination,
            reason: req.reason,
            exit_time: req.exit_time.substring(0, 16), // Format for datetime-local
            return_time: req.return_time.substring(0, 16),
            parent_contact: req.parent_contact || ''
        });
        setEditingId(req.id);
        setIsEditing(true);
        setActiveTab('create');
    };

    const handleCancelEdit = () => {
        setFormData({
            destination: '',
            reason: '',
            exit_time: '',
            return_time: '',
            parent_contact: ''
        });
        setIsEditing(false);
        setEditingId(null);
        setActiveTab('list');
    };

    const handleDeleteRequest = async (id: string) => {
        if (!id) return;
        const res = await dataService.deleteExitPermission(id);
        if (res.success) {
            toastSuccess('Đã xóa đơn xin phép');
            setRequests(prev => prev.filter(r => r.id !== id));
            setShowDeleteConfirm(null);
        } else {
            toastError(res.error || 'Lỗi xóa đơn');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-black uppercase"><CheckCircle size={12} /> Đã duyệt</span>;
            case 'rejected':
                return <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-black uppercase"><XCircle size={12} /> Từ chối</span>;
            default:
                return <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-black uppercase"><Clock size={12} /> Chờ duyệt</span>;
        }
    };

    return (
        <div className="space-y-4 pb-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 leading-tight">Đơn Xin Phép</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Quản lý ra vào</p>
                    </div>
                </div>
                {activeTab === 'list' && (
                    <button
                        onClick={() => { handleCancelEdit(); setActiveTab('create'); }}
                        className="flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                    >
                        <Plus size={16} /> TẠO ĐƠN
                    </button>
                )}
            </div>

            {activeTab === 'list' ? (
                <div className="space-y-3">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-400 text-xs font-bold mt-4 animate-pulse">ĐANG TẢI DỮ LIỆU...</p>
                        </div>
                    )}

                    {!loading && requests.length === 0 && (
                        <div className="text-center py-12 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Clock size={32} className="text-gray-300" />
                            </div>
                            <p className="text-gray-500 font-black">Chưa có đơn nào</p>
                            <p className="text-gray-400 text-xs mt-1 font-medium italic">Bạn hãy tạo đơn mới để xin phép ra ngoài</p>
                        </div>
                    )}

                    {requests.map((req) => (
                        <div key={req.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4 relative group overflow-hidden active:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start relative z-10">
                                <div className="flex items-start gap-4">
                                    <div className="bg-indigo-50 p-3 rounded-2xl">
                                        <Clock className="text-indigo-600" size={24} />
                                    </div>
                                    <div>
                                        <div className="font-black text-gray-900">Ngày: {new Date(req.exit_time).toLocaleDateString('vi-VN')}</div>
                                        <div className="text-xs text-gray-500 font-bold mt-1">
                                            {new Date(req.exit_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            <span className="mx-2 text-gray-300">→</span>
                                            {new Date(req.return_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                                {getStatusBadge(req.status)}
                            </div>

                            <div className="space-y-3 relative z-10">
                                <div className="flex items-center gap-3 text-sm text-gray-600 ml-1">
                                    <MapPin size={16} className="text-indigo-400" />
                                    <span className="font-bold">{req.destination}</span>
                                </div>
                                <div className="text-sm text-gray-700 bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                                    <span className="font-black text-[10px] text-gray-400 block mb-1 uppercase tracking-widest">Lý do</span>
                                    <p className="font-medium">{req.reason}</p>
                                </div>

                                {req.status === 'rejected' && req.rejection_reason && (
                                    <div className="text-sm text-red-700 bg-red-50 p-3 rounded-2xl border border-red-100">
                                        <span className="font-black text-[10px] text-red-400 block mb-1 uppercase tracking-widest">Phản hồi từ Admin</span>
                                        <p className="font-medium italic">"{req.rejection_reason}"</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions for Pending */}
                            {req.status === 'pending' && (
                                <div className="flex gap-2 mt-2 pt-4 border-t border-gray-100">
                                    <button
                                        onClick={() => handleEditClick(req)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black hover:bg-indigo-100 transition-colors"
                                    >
                                        <Edit size={14} /> SỬA ĐƠN
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(req.id)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-black hover:bg-red-100 transition-colors"
                                    >
                                        <Trash2 size={14} /> XÓA ĐƠN
                                    </button>
                                </div>
                            )}

                            {/* Background Pattern */}
                            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-indigo-50/20 rounded-full blur-2xl pointer-events-none"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white p-6 rounded-3xl shadow-xl shadow-indigo-50 border border-gray-100 animate-in fade-in slide-in-from-bottom-6 duration-500">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="flex items-center gap-2 mb-2">
                            <ChevronLeft
                                size={20}
                                className="text-gray-400 cursor-pointer hover:text-indigo-600"
                                onClick={handleCancelEdit}
                            />
                            <h3 className="text-lg font-black text-gray-900">
                                {isEditing ? 'Chỉnh Sửa Đơn' : 'Tạo Đơn Mới'}
                            </h3>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Lý do chính</label>
                            <select
                                className="w-full p-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all text-sm font-bold text-gray-800"
                                value={formData.reason}
                                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                required
                            >
                                <option value="">-- Chọn lý do --</option>
                                <option value="Về quê">🏠 Về quê</option>
                                <option value="Mua đồ dùng cá nhân">🛍️ Mua đồ dùng cá nhân</option>
                                <option value="Khám bệnh">🏥 Khám bệnh</option>
                                <option value="Gặp gia đình">👨‍👩‍👧‍👦 Gặp gia đình</option>
                                <option value="Khác">✨ Khác</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Cụ thể / Nơi đến</label>
                            <input
                                type="text"
                                className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all text-sm font-bold text-gray-800"
                                placeholder="VD: Nhà sách Fahasa, Bệnh viện..."
                                value={formData.destination}
                                onChange={e => setFormData({ ...formData, destination: e.target.value })}
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Thời gian đi (dự kiến)</label>
                                <input
                                    type="datetime-local"
                                    className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-600 transition-all text-sm font-bold text-gray-800"
                                    value={formData.exit_time}
                                    onChange={e => setFormData({ ...formData, exit_time: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Thời gian về (dự kiến)</label>
                                <input
                                    type="datetime-local"
                                    className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-600 transition-all text-sm font-bold text-gray-800"
                                    value={formData.return_time}
                                    onChange={e => setFormData({ ...formData, return_time: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">SĐT Phụ huynh</label>
                            <input
                                type="tel"
                                className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-600 transition-all text-sm font-bold text-gray-800"
                                placeholder="VD: 0987xxx..."
                                value={formData.parent_contact}
                                onChange={e => setFormData({ ...formData, parent_contact: e.target.value })}
                                required
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="flex-1 py-4 bg-gray-50 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-100 transition-all"
                            >
                                HỦY BỎ
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? 'ĐANG XỬ LÝ...' : (isEditing ? 'CẬP NHẬT ĐƠN' : 'GỬI ĐƠN NGAY')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Trash size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-center text-gray-900 mb-3">Bạn chắc chắn?</h3>
                        <p className="text-gray-500 text-center mb-8 font-medium leading-relaxed">
                            Đơn xin phép này sẽ bị xóa vĩnh viễn khỏi hệ thống.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-50 rounded-2xl transition-all"
                            >
                                HỦY
                            </button>
                            <button
                                onClick={() => handleDeleteRequest(showDeleteConfirm)}
                                className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
                            >
                                XÓA ĐƠN
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

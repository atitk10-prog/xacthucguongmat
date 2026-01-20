import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import { Search, Filter, Plus, Minus, History, Save, X, User as UserIcon, Shield, AlertCircle, CheckCircle } from 'lucide-react';

interface PointManagementProps {
    onBack?: () => void;
}

interface PointLog {
    id: string;
    user_id: string;
    points: number;
    reason: string;
    type: string;
    event_id: string;
    created_by: string;
    created_at: string;
}

const PointManagement: React.FC<PointManagementProps> = ({ onBack }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<PointLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterClass, setFilterClass] = useState<string>('all');

    const [formData, setFormData] = useState({
        user_id: '',
        points: '',
        reason: '',
        action: 'add' as 'add' | 'deduct'
    });

    const [showModal, setShowModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersResult, logsResult] = await Promise.all([
                dataService.getUsers({ status: 'active' }),
                dataService.getPointLogs()
            ]);

            if (usersResult.success && usersResult.data) setUsers(usersResult.data);
            if (logsResult.success && logsResult.data) setLogs(logsResult.data as PointLog[]);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.user_id || !formData.points || !formData.reason) return;

        setIsSubmitting(true);
        setResult(null);

        try {
            const points = parseInt(formData.points);
            let response;

            if (formData.action === 'add') {
                response = await dataService.addPoints(formData.user_id, points, formData.reason);
            } else {
                response = await dataService.deductPoints(formData.user_id, points, formData.reason);
            }

            if (response.success) {
                setResult({
                    success: true,
                    message: formData.action === 'add'
                        ? `Đã cộng ${points} điểm thành công!`
                        : `Đã trừ ${points} điểm thành công!`
                });
                setFormData({ user_id: '', points: '', reason: '', action: 'add' });
                setShowModal(false);
                loadData();
            } else {
                setResult({ success: false, message: response.error || 'Có lỗi xảy ra' });
            }
        } catch (error) {
            setResult({ success: false, message: 'Có lỗi xảy ra' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQuickAction = (user: User, action: 'add' | 'deduct') => {
        setSelectedUser(user);
        setFormData({ ...formData, user_id: user.id, action, points: '', reason: '' });
        setShowModal(true);
        setResult(null);
    };

    const uniqueClasses = useMemo(() => {
        const classes = new Set(users.map(u => u.organization).filter(Boolean));
        return Array.from(classes).sort();
    }, [users]);

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (user.student_code && user.student_code.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesClass = filterClass === 'all' || user.organization === filterClass;
        const isStudent = user.role === 'student'; // Only show students

        return matchesSearch && matchesClass && isStudent;
    });

    const getTypeLabel = (type: string): { text: string; color: string } => {
        const types: Record<string, { text: string; color: string }> = {
            checkin: { text: 'Check-in', color: 'bg-blue-100 text-blue-600' },
            boarding: { text: 'Nội trú', color: 'bg-purple-100 text-purple-600' },
            manual_add: { text: 'Cộng thủ công', color: 'bg-emerald-100 text-emerald-600' },
            manual_deduct: { text: 'Trừ thủ công', color: 'bg-red-100 text-red-600' }
        };
        return types[type] || { text: type, color: 'bg-slate-100 text-slate-600' };
    };

    const quickReasons = [
        { text: 'Hoàn thành tốt nhiệm vụ', points: 10, action: 'add' },
        { text: 'Tham gia tích cực', points: 5, action: 'add' },
        { text: 'Đạt thành tích xuất sắc', points: 20, action: 'add' },
        { text: 'Vi phạm nội quy', points: 10, action: 'deduct' },
        { text: 'Đi muộn nhiều lần', points: 5, action: 'deduct' },
        { text: 'Không hoàn thành nhiệm vụ', points: 15, action: 'deduct' }
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <span className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                            <Shield className="w-8 h-8" />
                        </span>
                        Quản lý Điểm
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 ml-14">Cộng / Trừ điểm thưởng, phạt cho học sinh</p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                        ← Quay lại
                    </button>
                )}
            </div>

            {result && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 animate-fade-in ${result.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {result.success ? <CheckCircle className="w-6 h-6 flex-shrink-0" /> : <AlertCircle className="w-6 h-6 flex-shrink-0" />}
                    <span className="font-bold">{result.message}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Student List (2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                            <h3 className="font-black text-slate-900 text-xl">Danh sách học sinh</h3>
                            <div className="flex gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Tìm tên, mã HS..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <select
                                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-600"
                                    value={filterClass}
                                    onChange={(e) => setFilterClass(e.target.value)}
                                >
                                    <option value="all">Tất cả lớp</option>
                                    {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredUsers.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <UserIcon className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                                    <p>Không tìm thấy học sinh nào</p>
                                </div>
                            ) : (
                                filteredUsers.map(user => (
                                    <div key={user.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                {user.avatar_url ? (
                                                    <img src={user.avatar_url} alt={user.full_name} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm" />
                                                ) : (
                                                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center text-indigo-600 border-2 border-white shadow-sm">
                                                        <span className="font-black text-lg">{user.full_name.charAt(0)}</span>
                                                    </div>
                                                )}
                                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
                                                    <span className="w-3 h-3 block rounded-full bg-emerald-500"></span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 text-lg group-hover:text-indigo-700 transition-colors">{user.full_name}</p>
                                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                                    <span className="bg-slate-200 px-2 py-0.5 rounded text-xs font-bold text-slate-600">{user.student_code || 'N/A'}</span>
                                                    <span>•</span>
                                                    <span>{user.organization || 'Chưa phân lớp'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-right mr-2 hidden sm:block">
                                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tổng điểm</p>
                                                <p className="text-2xl font-black text-indigo-600">{user.total_points || 0}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleQuickAction(user, 'add')}
                                                    className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-200 hover:scale-110 transition-all font-bold shadow-sm"
                                                    title="Cộng điểm"
                                                >
                                                    <Plus className="w-6 h-6" />
                                                </button>
                                                <button
                                                    onClick={() => handleQuickAction(user, 'deduct')}
                                                    className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center hover:bg-red-200 hover:scale-110 transition-all font-bold shadow-sm"
                                                    title="Trừ điểm"
                                                >
                                                    <Minus className="w-6 h-6" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <p className="text-right text-xs text-slate-400 mt-4 font-medium">Hiển thị {filteredUsers.length} học sinh</p>
                    </div>
                </div>

                {/* Confirm Action Modal (Overlay) */}
                {showModal && selectedUser && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                        <div className="bg-white rounded-3xl p-0 max-w-md w-full shadow-2xl overflow-hidden animate-scale-up">
                            {/* Modal Header */}
                            <div className={`p-6 text-white flex justify-between items-center ${formData.action === 'add' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-red-500 to-orange-600'}`}>
                                <h3 className="text-2xl font-black flex items-center gap-2">
                                    {formData.action === 'add' ? <Plus className="w-6 h-6" /> : <Minus className="w-6 h-6" />}
                                    {formData.action === 'add' ? 'Cộng điểm' : 'Trừ điểm'}
                                </h3>
                                <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white bg-white/10 p-2 rounded-full backdrop-blur-md transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6">
                                {/* Student Info in Modal */}
                                <div className="flex flex-col items-center mb-8 -mt-12">
                                    <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-slate-100 mb-3">
                                        {selectedUser.avatar_url ? (
                                            <img src={selectedUser.avatar_url} alt={selectedUser.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                                                <UserIcon className="w-10 h-10" />
                                            </div>
                                        )}
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-900 text-center">{selectedUser.full_name}</h4>
                                    <p className="text-slate-500 font-medium">{selectedUser.organization} • {selectedUser.student_code}</p>
                                    <div className="mt-2 bg-slate-100 px-4 py-2 rounded-xl text-slate-600 text-sm font-bold flex items-center gap-2 justify-center">
                                        <span>Điểm hiện tại: {selectedUser.total_points || 0}</span>
                                        {formData.points && !isNaN(parseInt(formData.points)) && (
                                            <>
                                                <span className="text-slate-400">→</span>
                                                <span className={`${formData.action === 'add' ? 'text-emerald-600' : 'text-red-600'} text-base`}>
                                                    Mới: {(selectedUser.total_points || 0) + (formData.action === 'add' ? parseInt(formData.points) : -parseInt(formData.points))}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Lý do nhanh</p>
                                        <div className="flex flex-wrap gap-2">
                                            {quickReasons.filter(r => r.action === formData.action).map((reason, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, reason: reason.text, points: reason.points.toString() })}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${formData.reason === reason.text
                                                        ? (formData.action === 'add' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-2 ring-emerald-500/20' : 'bg-red-50 border-red-200 text-red-700 ring-2 ring-red-500/20')
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                                        }`}
                                                >
                                                    {reason.text} <span className="opacity-60 ml-1">({reason.points})</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1">
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Điểm *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={formData.points}
                                                onChange={e => setFormData({ ...formData, points: e.target.value })}
                                                required
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-2xl font-black text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Lý do chi tiết *</label>
                                            <input
                                                type="text"
                                                value={formData.reason}
                                                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                                required
                                                placeholder="Nhập lý do..."
                                                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={`w-full py-4 rounded-xl font-black text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 ${isSubmitting
                                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed transform-none shadow-none'
                                            : formData.action === 'add'
                                                ? 'bg-emerald-600 text-white shadow-emerald-200'
                                                : 'bg-red-600 text-white shadow-red-200'
                                            }`}
                                    >
                                        {isSubmitting ? (
                                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <Save className="w-5 h-5" />
                                                {formData.action === 'add' ? 'XÁC NHẬN CỘNG' : 'XÁC NHẬN TRỪ'}
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Recent Logs (1 col) */}
                <div className="space-y-4">
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 h-full max-h-[700px] flex flex-col">
                        <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                            <History className="w-5 h-5 text-slate-400" />
                            Lịch sử gần đây
                        </h3>

                        <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                            {logs.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <p>Chưa có lịch sử</p>
                                </div>
                            ) : (
                                logs.slice(0, 20).map(log => {
                                    const user = users.find(u => u.id === log.user_id);
                                    const typeInfo = getTypeLabel(log.type);
                                    return (
                                        <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex gap-3">
                                                    {user?.avatar_url && (
                                                        <img src={user.avatar_url} className="w-10 h-10 rounded-full object-cover border border-white shadow-sm flex-shrink-0" />
                                                    )}
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold text-slate-900 text-sm leading-tight">{user?.full_name || 'Học sinh đã xóa'}</p>
                                                            {user && (
                                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                                                    Tổng: {user.total_points}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 line-clamp-2">{log.reason}</p>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${typeInfo.color}`}>
                                                                {typeInfo.text}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleDateString('vi-VN')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`font-black text-lg ${log.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {log.points >= 0 ? '+' : ''}{log.points}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PointManagement;

import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';

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
        setFormData({ ...formData, user_id: user.id, action });
        setShowModal(true);
    };

    const filteredUsers = users.filter(user =>
        user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.class_id && user.class_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

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
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                        Quản lý Điểm
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Cộng / Trừ điểm cho học sinh</p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                        ← Quay lại
                    </button>
                )}
            </div>

            {result && (
                <div className={`p-4 rounded-2xl ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {result.message}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Student List */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-black text-slate-900 mb-4">Danh sách học sinh</h3>

                    <input
                        type="text"
                        placeholder="Tìm kiếm theo tên hoặc lớp..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-4"
                    />

                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {filteredUsers.filter(u => u.role === 'student').map(user => (
                            <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">{user.full_name}</p>
                                        <p className="text-sm text-slate-500">{user.class_id || 'Chưa phân lớp'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-black text-lg text-indigo-600">{user.total_points || 0}</span>
                                    <button
                                        onClick={() => handleQuickAction(user, 'add')}
                                        className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg font-bold hover:bg-emerald-200"
                                    >
                                        +
                                    </button>
                                    <button
                                        onClick={() => handleQuickAction(user, 'deduct')}
                                        className="w-8 h-8 bg-red-100 text-red-600 rounded-lg font-bold hover:bg-red-200"
                                    >
                                        −
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Point Logs */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-black text-slate-900 mb-4">Lịch sử thay đổi điểm</h3>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {logs.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                                </svg>
                                <p>Chưa có lịch sử</p>
                            </div>
                        ) : (
                            logs.slice(0, 20).map(log => {
                                const user = users.find(u => u.id === log.user_id);
                                const typeInfo = getTypeLabel(log.type);
                                return (
                                    <div key={log.id} className="p-3 bg-slate-50 rounded-xl">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-slate-900">{user?.full_name || 'Unknown'}</p>
                                                <p className="text-sm text-slate-500">{log.reason}</p>
                                                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${typeInfo.color}`}>
                                                    {typeInfo.text}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-xl font-black ${log.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {log.points >= 0 ? '+' : ''}{log.points}
                                                </span>
                                                <p className="text-xs text-slate-400">
                                                    {new Date(log.created_at).toLocaleDateString('vi-VN')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Add/Deduct Modal */}
            {showModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                {formData.action === 'add' ? (
                                    <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                ) : (
                                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                                )}
                                {formData.action === 'add' ? 'Cộng điểm' : 'Trừ điểm'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900">{selectedUser.full_name}</p>
                                    <p className="text-sm text-slate-500">Điểm hiện tại: <strong>{selectedUser.total_points || 0}</strong></p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Quick Reasons */}
                            <div>
                                <p className="text-sm font-bold text-slate-700 mb-2">Lý do nhanh:</p>
                                <div className="flex flex-wrap gap-2">
                                    {quickReasons.filter(r => r.action === formData.action).map((reason, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, reason: reason.text, points: reason.points.toString() })}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${formData.reason === reason.text
                                                ? (formData.action === 'add' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                        >
                                            {reason.text} ({reason.action === 'add' ? '+' : '-'}{reason.points})
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Số điểm *</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={formData.points}
                                    onChange={e => setFormData({ ...formData, points: e.target.value })}
                                    required
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-bold text-center"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Lý do *</label>
                                <input
                                    type="text"
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                    required
                                    placeholder="Nhập lý do..."
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`w-full py-4 rounded-2xl font-black text-lg ${isSubmitting
                                    ? 'bg-slate-300 text-slate-500'
                                    : formData.action === 'add'
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-red-600 text-white hover:bg-red-700'
                                    }`}
                            >
                                {isSubmitting ? 'ĐANG XỬ LÝ...' : (
                                    <span className="flex items-center justify-center gap-2">
                                        {formData.action === 'add' ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                                        )}
                                        {formData.action === 'add' ? 'CỘNG ĐIỂM' : 'TRỪ ĐIỂM'}
                                    </span>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PointManagement;

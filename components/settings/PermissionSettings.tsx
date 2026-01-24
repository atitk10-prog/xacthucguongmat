import React, { useEffect, useState } from 'react';
import { Icons } from '../ui';
import { dataService } from '../../services/dataService';
import { useToast } from '../ui/Toast';

interface Permission {
    module_id: string;
    module_name: string;
    is_enabled: boolean;
    can_edit: boolean;
    can_delete: boolean;
}

const PermissionSettings: React.FC = () => {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        loadPermissions();
    }, []);

    const loadPermissions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await dataService.getTeacherPermissions();
            if (res.success && res.data) {
                setPermissions(res.data);
            } else {
                setError(res.error || 'Không thể tải dữ liệu phân quyền');
            }
        } catch (err: any) {
            setError(err.message || 'Lỗi kết nối database');
        }
        setLoading(false);
    };

    const handleToggle = async (moduleId: string, field: keyof Permission, value: boolean) => {
        const res = await dataService.updateTeacherPermission(moduleId, { [field]: value });
        if (res.success) {
            setPermissions(prev => prev.map(p => p.module_id === moduleId ? { ...p, [field]: value } : p));
            toast.success('Đã cập nhật quyền hạn');
        } else {
            toast.error('Lỗi: ' + res.error);
        }
    };

    if (loading) return (
        <div className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-bold text-slate-500">Đang tải phân quyền...</p>
        </div>
    );

    if (error) return (
        <div className="p-12 text-center bg-red-50 rounded-[3rem] border border-red-100 max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                <Icons.AlertCircle className="text-red-500 w-10 h-10" />
            </div>
            <div className="space-y-2">
                <h3 className="text-xl font-black text-red-900">Lỗi truy cập dữ liệu</h3>
                <p className="text-red-700/70 font-medium">Bảng `teacher_permissions` có thể chưa được khởi tạo trong Supabase hoặc bạn không có quyền truy cập.</p>
                <div className="text-xs bg-red-100 p-3 rounded-lg font-mono text-red-800 break-all">{error}</div>
            </div>
            <button
                onClick={loadPermissions}
                className="px-8 py-3 bg-red-600 text-white rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-700 transition-all font-sans"
            >
                Thử lại ngay
            </button>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-sans">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-2xl font-black mb-2">Phân quyền Giáo viên</h2>
                    <p className="text-indigo-100 opacity-80">Quản lý các module và tính năng dành riêng cho giáo viên.</p>
                </div>
                <Icons.Shield className="absolute -right-6 -bottom-6 w-48 h-48 text-white/10 rotate-12" />
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <th className="px-8 py-5 font-sans">Tên Module</th>
                            <th className="px-8 py-5 text-center font-sans">Hiển thị</th>
                            <th className="px-8 py-5 text-center font-sans">Chỉnh sửa</th>
                            <th className="px-8 py-5 text-center font-sans">Xóa</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {permissions.map((p) => (
                            <tr key={p.module_id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-8 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                            <Icons.Users className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-700 font-sans">{p.module_name}</p>
                                            <code className="text-[9px] text-slate-400 font-mono">{p.module_id}</code>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-5 text-center">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={p.is_enabled}
                                            onChange={(e) => handleToggle(p.module_id, 'is_enabled', e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </td>
                                <td className="px-8 py-5 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={p.can_edit}
                                        onChange={(e) => handleToggle(p.module_id, 'can_edit', e.target.checked)}
                                    />
                                </td>
                                <td className="px-8 py-5 text-center">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={p.can_delete}
                                        onChange={(e) => handleToggle(p.module_id, 'can_delete', e.target.checked)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 flex gap-4">
                <Icons.Bell className="text-amber-500 w-6 h-6 shrink-0" />
                <div className="text-sm text-amber-800 font-sans">
                    <p className="font-bold mb-1">Lưu ý phân quyền:</p>
                    <p className="opacity-80">Thay đổi quyền hạn sẽ có hiệu lực ngay lập tức. Giáo viên cần tải lại trang để thấy các thay đổi trên Menu chính.</p>
                </div>
            </div>
        </div>
    );
};

export default PermissionSettings;

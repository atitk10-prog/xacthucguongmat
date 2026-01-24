import React, { useState } from 'react';
import { User, Mail, Database, Camera, RotateCw, Lock, Eye, EyeOff, X, Edit2, Shield } from 'lucide-react';
import { User as UserType } from '../../types';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../components/ui/Toast';

const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const maxWidth = 1000;
        const maxHeight = 1000;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    } else {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const newFile = new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
                        resolve(newFile);
                    } else reject(new Error('Canvas to Blob failed'));
                }, 'image/jpeg', 0.85);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

const InfoRow = ({ icon, label, value }: any) => (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors px-2 rounded-lg">
        <div className="text-indigo-500 p-2 bg-indigo-50 rounded-lg">{icon}</div>
        <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
            <p className="text-gray-800 font-medium text-sm">{value || '---'}</p>
        </div>
    </div>
);

const PasswordInput = ({ label, value, onChange, show, onToggle }: any) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            <input
                type={show ? "text" : "password"}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full p-3 pr-10 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <button
                type="button"
                onClick={onToggle}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
        </div>
    </div>
);

interface AdminProfileProps {
    user: UserType;
}

export default function AdminProfile({ user: initialUser }: AdminProfileProps) {
    const { success: toastSuccess, error: toastError } = useToast();
    const [user, setUser] = useState<UserType>(initialUser);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Partial<UserType>>({});
    const [isChangingPass, setIsChangingPass] = useState(false);
    const [passData, setPassData] = useState({ oldPass: '', newPass: '', confirmPass: '' });
    const [showPass, setShowPass] = useState({ old: false, new: false, confirm: false });
    const [loading, setLoading] = useState(false);

    const handleEdit = () => {
        setFormData({
            email: user.email,
            full_name: user.full_name
        });
        setIsEditing(true);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await dataService.updateUser(user.id, formData);
            if (res.success && res.data) {
                setUser(res.data);
                setIsEditing(false);
                toastSuccess('Cập nhật thông tin thành công!');
                // Update local storage to reflect changes immediately across reloads if needed
                localStorage.setItem('educheck_user', JSON.stringify(res.data));
            } else {
                toastError('Cập nhật thất bại: ' + res.error);
            }
        } catch (error) {
            console.error(error);
            toastError('Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passData.oldPass || !passData.newPass) {
            toastError('Vui lòng nhập đầy đủ thông tin');
            return;
        }
        if (passData.newPass !== passData.confirmPass) {
            toastError('Mật khẩu mới không khớp');
            return;
        }
        if (passData.newPass.length < 6) {
            toastError('Mật khẩu mới phải có ít nhất 6 ký tự');
            return;
        }

        setLoading(true);
        try {
            const loginRes = await dataService.login(user.email, passData.oldPass);
            if (!loginRes.success) {
                toastError('Mật khẩu cũ không chính xác');
                setLoading(false);
                return;
            }

            const updateRes = await dataService.updateUser(user.id, { password: passData.newPass });
            if (updateRes.success) {
                toastSuccess('Đổi mật khẩu thành công!');
                setIsChangingPass(false);
                setPassData({ oldPass: '', newPass: '', confirmPass: '' });
            } else {
                toastError('Đổi mật khẩu thất bại: ' + updateRes.error);
            }
        } catch (error) {
            console.error(error);
            toastError('Lỗi hệ thống');
        } finally {
            setLoading(false);
        }
    };

    const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const compressedFile = await compressImage(file);
            const fileName = `${user.id}_${Date.now()}.jpg`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressedFile);
            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);

            // Save immediately
            const res = await dataService.updateUser(user.id, { avatar_url: urlData.publicUrl });
            if (res.success && res.data) {
                setUser(res.data);
                localStorage.setItem('educheck_user', JSON.stringify(res.data));
                toastSuccess('Đã cập nhật ảnh đại diện!');
            }
        } catch (error: any) {
            toastError('Lỗi tải ảnh: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto p-4 md:p-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Hồ Sơ Của Tôi</h2>
                    <p className="text-gray-500">Quản lý thông tin tài khoản</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsChangingPass(true)}
                        className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 shadow-sm"
                    >
                        <Lock size={16} />
                        Đổi mật khẩu
                    </button>
                    <button
                        onClick={handleEdit}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700"
                    >
                        <Edit2 size={16} />
                        Cập nhật
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Avatar Section */}
                <div className="md:col-span-1">
                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 pointer-events-none" />

                        <div className="relative group cursor-pointer mb-4" onClick={() => document.getElementById('avatar-upload')?.click()}>
                            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-xl bg-white">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                                        <User size={48} />
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera size={24} className="text-white" />
                            </div>
                            <input id="avatar-upload" type="file" className="hidden" accept="image/*" onChange={handleUploadAvatar} disabled={loading} />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900">{user.full_name}</h3>
                        <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {user.role}
                        </span>
                    </div>
                </div>

                {/* Details Section */}
                <div className="md:col-span-2">
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 h-full">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Database size={20} className="text-indigo-500" />
                            Thông tin chi tiết
                        </h3>
                        <div className="space-y-1">
                            <InfoRow icon={<Shield size={18} />} label="Vai trò hệ thống" value={user.role === 'admin' ? 'Quản trị viên Hệ thống' : 'Giáo viên / Cán bộ'} />
                            <InfoRow icon={<Mail size={18} />} label="Email liên hệ" value={user.email} />
                            <InfoRow icon={<User size={18} />} label="Họ và tên hiển thị" value={user.full_name} />
                            <InfoRow icon={<Database size={18} />} label="ID Hệ thống" value={user.id} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {isChangingPass && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Lock className="text-indigo-600" size={20} />
                                Đổi Mật Khẩu
                            </h3>
                            <button onClick={() => setIsChangingPass(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <PasswordInput label="Mật khẩu hiện tại" value={passData.oldPass} onChange={(val: string) => setPassData({ ...passData, oldPass: val })} show={showPass.old} onToggle={() => setShowPass({ ...showPass, old: !showPass.old })} />
                            <PasswordInput label="Mật khẩu mới" value={passData.newPass} onChange={(val: string) => setPassData({ ...passData, newPass: val })} show={showPass.new} onToggle={() => setShowPass({ ...showPass, new: !showPass.new })} />
                            <PasswordInput label="Nhập lại mật khẩu mới" value={passData.confirmPass} onChange={(val: string) => setPassData({ ...passData, confirmPass: val })} show={showPass.confirm} onToggle={() => setShowPass({ ...showPass, confirm: !showPass.confirm })} />
                            <button onClick={handleChangePassword} disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 mt-4">
                                {loading && <RotateCw className="animate-spin" size={20} />}
                                Xác nhận đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isEditing && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Edit2 className="text-indigo-600" size={20} />
                                Cập nhật thông tin
                            </h3>
                            <button onClick={() => setIsEditing(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                                <input type="text" value={formData.full_name || ''} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <button onClick={handleSave} disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 mt-4">
                                {loading && <RotateCw className="animate-spin" size={20} />}
                                Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

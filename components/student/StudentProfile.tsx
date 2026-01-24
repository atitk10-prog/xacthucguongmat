import React, { useState, useEffect } from 'react';
import { User, Mail, Hash, Calendar, Layers, MapPin, Grid, Edit2, X, Save, Camera, RotateCw, Lock, Eye, EyeOff } from 'lucide-react'; // Added icons
import { User as UserType } from '../../types';
import { dataService } from '../../services/dataService'; // Import dataService
import { supabase } from '../../services/supabaseClient'; // Import supabase for query
import { useToast } from '../../components/ui/Toast'; // Import useToast

// Helper: Compress Image (from UserManagement)
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
                        const newFile = new File([blob], newName, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    } else {
                        reject(new Error('Canvas to Blob failed'));
                    }
                }, 'image/jpeg', 0.85);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

interface StudentProfileProps {
    user: UserType;
}

const InfoRow = ({ icon, label, value }: any) => (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors px-2 rounded-lg">
        <div className="text-blue-500 p-2 bg-blue-50 rounded-lg">
            {icon}
        </div>
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
                type="button" // Prevent form submission
                onClick={onToggle}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
        </div>
    </div>
);

export default function StudentProfile({ user: initialUser }: StudentProfileProps) {
    const { success: toastSuccess, error: toastError } = useToast();
    const [user, setUser] = useState<UserType>(initialUser);
    const [roomName, setRoomName] = useState<string>('');

    // Edit Profile State
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Partial<UserType>>({});

    // Change Password State
    const [isChangingPass, setIsChangingPass] = useState(false);
    const [passData, setPassData] = useState({ oldPass: '', newPass: '', confirmPass: '' });
    const [showPass, setShowPass] = useState({ old: false, new: false, confirm: false });

    const [loading, setLoading] = useState(false);
    const [faceStatus, setFaceStatus] = useState<'none' | 'processing' | 'success' | 'failed'>('none');

    // Subscribe to Face ID computation updates
    useEffect(() => {
        const unsubscribe = dataService.onFaceComputeComplete((userId, result) => {
            if (userId === user.id) {
                if (result.success) {
                    setFaceStatus('success');
                    toastSuccess('Phân tích khuôn mặt thành công!');
                } else {
                    setFaceStatus('failed');
                    toastError('Không thể nhận diện khuôn mặt: ' + (result.error || 'Lỗi không xác định'));
                }
            }
        });

        return () => unsubscribe();
    }, [user.id]);

    useEffect(() => {
        // Fetch Room Name
        const fetchRoom = async () => {
            if (user.room_id) {
                // Fetch all rooms and find (since no getRoomById exposed yet)
                // Or better, querying directly here for efficiency if needed, but dataService.getRooms() is cached
                // Let's us Supabase directly for single fetch to be lightweight
                try {
                    const { data } = await supabase.from('rooms').select('name').eq('id', user.room_id).single();
                    if (data) setRoomName(data.name);
                } catch (e) {
                    console.error("Error fetching room", e);
                }
            }
        };
        fetchRoom();
    }, [user.room_id]);

    const handleEdit = () => {
        setFormData({
            email: user.email,
            birth_date: user.birth_date,
            avatar_url: user.avatar_url
            // Not allowing edits to student_code, full_name, organization, etc. without admin
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
                // Optionally trigger a global user update if context exists, 
                // but for now local update reflects change
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
            // 1. Verify old password by attempting 'login'
            const loginRes = await dataService.login(user.email, passData.oldPass); // Use email from state, assuming it's correct

            // Check if login was successful and returned user data, which implies authentication passed
            if (!loginRes.success) {
                // Try logging in with student code if email fails, just in case
                const loginResCode = await dataService.login(user.student_code || '', passData.oldPass);
                if (!loginResCode.success) {
                    toastError('Mật khẩu cũ không chính xác');
                    setLoading(false);
                    return;
                }
            }

            // 2. Update to new password
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
            // 0. Compress Image
            const compressedFile = await compressImage(file);

            // 1. Upload to Supabase Storage
            const fileExt = 'jpg'; // Forced by compression
            const fileName = `${user.id}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, compressedFile);

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const publicUrl = urlData.publicUrl;

            // 3. Update local state
            setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
            setFaceStatus('processing');

            toastSuccess('Đã tải ảnh lên! Đang phân tích khuôn mặt...');
        } catch (error: any) {
            console.error('Error uploading image:', error);
            toastError('Lỗi tải ảnh: ' + error.message);
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Thông Tin Cá Nhân</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsChangingPass(true)}
                        className="flex items-center gap-2 bg-gray-100 text-gray-700 p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-bold active:scale-95 transition-all hover:bg-gray-200"
                        title="Đổi mật khẩu"
                    >
                        <Lock size={16} />
                        <span className="hidden sm:inline">Đổi MK</span>
                    </button>
                    <button
                        onClick={handleEdit}
                        className="flex items-center gap-2 bg-indigo-600 text-white p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-all hover:bg-indigo-700"
                    >
                        <Edit2 size={16} />
                        <span className="hidden sm:inline">Cập nhật</span>
                    </button>
                </div>
            </div>

            {/* Avatar Card */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 flex flex-col items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none" />

                <div className="w-28 h-28 bg-white rounded-full mb-4 overflow-hidden border-[6px] border-white shadow-xl relative z-10 group cursor-pointer" onClick={handleEdit}>
                    {user.avatar_url ? (
                        <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                            <User size={40} />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera size={24} className="text-white" />
                    </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 relative z-10">{user.full_name}</h3>
                <div className="flex flex-col items-center gap-2 mt-2 relative z-10">
                    <span className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full font-bold">Học sinh Nội trú</span>

                    {/* Face ID Status Badge */}
                    {faceStatus === 'processing' && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">
                            <RotateCw size={10} className="animate-spin" />
                            ĐANG PHÂN TÍCH FACE ID...
                        </div>
                    )}
                    {faceStatus === 'success' && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            ✓ FACE ID ĐÃ SẴN SÀNG
                        </div>
                    )}
                    {faceStatus === 'failed' && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            ⚠ CHƯA CÓ FACE ID (VUI LÒNG THỬ ẢNH KHÁC)
                        </div>
                    )}
                </div>
            </div>

            {/* Details List */}
            <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100">
                <InfoRow icon={<Hash size={18} />} label="Mã sinh viên" value={user.student_code} />
                <InfoRow icon={<Mail size={18} />} label="Email" value={user.email} />
                <InfoRow icon={<Calendar size={18} />} label="Ngày sinh" value={user.birth_date ? new Date(user.birth_date).toLocaleDateString('vi-VN') : ''} />
                <InfoRow icon={<Layers size={18} />} label="Lớp / Tổ chức" value={user.organization} />
                <InfoRow icon={<MapPin size={18} />} label="Phòng ở" value={roomName || 'Chưa xếp phòng'} />
                <InfoRow icon={<Grid size={18} />} label="Khu vực" value={user.zone} />
            </div>

            {/* Change Password Modal */}
            {isChangingPass && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">Đổi Mật Khẩu</h3>
                            <button onClick={() => setIsChangingPass(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <PasswordInput
                                label="Mật khẩu hiện tại"
                                value={passData.oldPass}
                                onChange={(val: string) => setPassData({ ...passData, oldPass: val })}
                                show={showPass.old}
                                onToggle={() => setShowPass({ ...showPass, old: !showPass.old })}
                            />
                            <PasswordInput
                                label="Mật khẩu mới"
                                value={passData.newPass}
                                onChange={(val: string) => setPassData({ ...passData, newPass: val })}
                                show={showPass.new}
                                onToggle={() => setShowPass({ ...showPass, new: !showPass.new })}
                            />
                            <PasswordInput
                                label="Nhập lại mật khẩu mới"
                                value={passData.confirmPass}
                                onChange={(val: string) => setPassData({ ...passData, confirmPass: val })}
                                show={showPass.confirm}
                                onToggle={() => setShowPass({ ...showPass, confirm: !showPass.confirm })}
                            />

                            <button
                                onClick={handleChangePassword}
                                disabled={loading}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                {loading && <RotateCw className="animate-spin" size={20} />}
                                Xác nhận đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditing && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">Cập nhật thông tin</h3>
                            <button onClick={() => setIsEditing(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-center mb-4">
                                <label className="relative cursor-pointer group">
                                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-gray-100">
                                        {formData.avatar_url ? (
                                            <img src={formData.avatar_url} className="w-full h-full object-cover" />
                                        ) : user.avatar_url ? (
                                            <img src={user.avatar_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-gray-100 flex items-center justify-center"><User /></div>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Camera className="text-white" size={20} />
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleUploadAvatar} />
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email || ''}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                                <input
                                    type="date"
                                    value={formData.birth_date ? formData.birth_date.split('T')[0] : ''}
                                    onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="p-3 bg-yellow-50 rounded-xl text-xs text-yellow-800">
                                * Một số thông tin như Mã SV, Lớp, Phòng không thể tự chỉnh sửa. Vui lòng liên hệ quản lý nếu có sai sót.
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
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


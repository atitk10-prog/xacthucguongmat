import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { User } from '../../types';
import * as XLSX from 'xlsx';
import { useToast, Icons } from '../ui';

interface UserManagementProps {
    onBack?: () => void;
}


// ... (imports)

// Helper: Compress Image
const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const maxWidth = 1200; // Increased slightly for better quality
        const maxHeight = 1200;
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
                        // Keep original name but enforce jpg for consistency if desired, or keep original ext
                        // Let's force jpeg for better compression
                        const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const newFile = new File([blob], newName, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    } else {
                        reject(new Error('Canvas to Blob failed'));
                    }
                }, 'image/jpeg', 0.85); // 0.85 Quality
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
    const { success, error: toastError, info } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterRole, setFilterRole] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination States
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalUsers, setTotalUsers] = useState(0);

    // Modal States
    const [showModal, setShowModal] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [showExcelModal, setShowExcelModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Batch Upload State
    const [batchFiles, setBatchFiles] = useState<FileList | null>(null);
    const [uploadLogs, setUploadLogs] = useState<string[]>([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        full_name: '',
        student_code: '', // New field
        role: 'student',
        class_id: '',
        room_id: '',
        organization: '', // New field (Tổ/Lớp)
        birth_date: '', // New field
        status: 'active',
        avatar_url: ''
    });

    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'warning' | 'info';
    }>({
        show: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'info'
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [rooms, setRooms] = useState<any[]>([]); // Use any or Room interface if available

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        loadUsers();
    }, [currentPage, pageSize, filterRole]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentPage !== 1) setCurrentPage(1);
            else loadUsers();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Subscribe to Face ID computation updates
    useEffect(() => {
        const unsubscribe = dataService.onFaceComputeComplete((userId, result) => {
            const user = users.find(u => u.id === userId);
            const userName = user?.full_name || 'Người dùng';

            if (result.success) {
                success(`Face ID: ${userName} - Thành công!`);
                // Update local state to reflect the new face_descriptor
                setUsers(prev => prev.map(u =>
                    u.id === userId ? { ...u, face_descriptor: 'computed' } as User : u
                ));
            } else {
                toastError(`Face ID: ${userName} - ${result.error || 'Thất bại'}`);
            }
        });

        return () => unsubscribe();
    }, [users, success, toastError]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const roomsRes = await dataService.getRooms();
            if (roomsRes.success && roomsRes.data) setRooms(roomsRes.data);
            await loadUsers();
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadUsers = async () => {
        setIsLoading(true);
        const result = await dataService.getUsers({
            role: filterRole,
            search: searchQuery,
            page: currentPage,
            pageSize: pageSize
        });

        if (result.success && result.data) {
            setUsers(result.data);
            if (result.data.total !== undefined) {
                setTotalUsers(result.data.total);
            }
        }
        setIsLoading(false);
    };

    const handleSingleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // Compress before upload
            const compressedFile = await compressImage(file);
            const fileExt = 'jpg'; // We force jpg in compressImage
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, compressedFile);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            setFormData(prev => ({ ...prev, avatar_url: data.publicUrl }));
        } catch (error) {
            console.error('Error uploading image:', error);
            toastError('Lỗi tải ảnh. Vui lòng thử lại.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            ...formData,
            // Only send password if it's set (for updates) or default for new
            password: formData.password || (editingUser ? undefined : '123456')
        };

        try {
            if (editingUser) {
                const result = await dataService.updateUser(editingUser.id, payload as Partial<User>);
                if (result.success) {
                    setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } as User : u));
                    setShowModal(false);
                    success('Cập nhật thành công!');
                } else {
                    toastError(`Lỗi cập nhật: ${result.error}`);
                }
            } else {
                const result = await dataService.createUser({ ...payload, password: payload.password });
                if (result.success && result.data) {
                    setUsers(prev => [result.data!, ...prev]); // Add to top
                    setShowModal(false);
                    success('Thêm mới thành công!');
                } else {
                    toastError(`Lỗi thêm mới: ${result.error}`);
                }
            }
        } catch (error: any) {
            console.error('Failed to save user:', error);
            toastError(`Đã xảy ra lỗi không mong muốn: ${error.message || error}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBatchProcess = async () => {
        if (!batchFiles || batchFiles.length === 0) return;
        setIsBatchProcessing(true);
        setUploadLogs(['Bắt đầu xử lý...', '---']);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < batchFiles.length; i++) {
            const file = batchFiles[i];
            const studentCode = file.name.split('.')[0]; // sv001.jpg -> sv001

            try {
                setUploadLogs(prev => [`Đang xử lý: ${file.name} (Mã: ${studentCode})...`, ...prev]);

                // 1. Find user by code
                const { data: foundUsers, error: searchError } = await supabase
                    .from('users')
                    .select('id, full_name')
                    .eq('student_code', studentCode)
                    .maybeSingle();

                if (searchError || !foundUsers) {
                    setUploadLogs(prev => [`Lỗi: Không tìm thấy user có mã: ${studentCode}`, ...prev]);
                    failCount++;
                    continue;
                }

                // 2. Upload Image
                const compressedFile = await compressImage(file);
                // studentCode is already defined
                const filePath = `avatars/${studentCode}_${Date.now()}.jpg`; // Force jpg
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, compressedFile, { upsert: true });

                if (uploadError) throw uploadError;

                // 3. Update User Record
                const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);

                const { error: updateError } = await supabase
                    .from('users')
                    .update({ avatar_url: urlData.publicUrl })
                    .eq('id', foundUsers.id);

                if (updateError) throw updateError;

                // 4. Trigger Face ID auto-compute
                dataService.computeAndSaveFaceDescriptor(foundUsers.id, urlData.publicUrl)
                    .catch(e => console.error('Batch face compute trigger error:', e));

                setUploadLogs(prev => [`Đã cập nhật ảnh & đang phân tích Face ID cho: ${foundUsers.full_name}`, ...prev]);
                successCount++;

            } catch (err: any) {
                setUploadLogs(prev => [`Lỗi file ${file.name}: ${err.message}`, ...prev]);
                failCount++;
            }
        }

        setUploadLogs(prev => [`---`, `HOÀN TẤT QUÁ TRÌNH TẢI LÊN`, `Thành công: ${successCount}`, `Thất bại: ${failCount}`, `Vui lòng kiểm tra log ở trên.`, ...prev]);

        if (failCount === 0) {
            success(`Đã xử lý xong ${successCount} ảnh!`);
        } else {
            info(`Hoàn tất với ${failCount} lỗi. Vui lòng kiểm tra log.`);
        }

        setIsBatchProcessing(false);
        // Do not close modal or clear files immediately so user can read logs
        // setBatchFiles(null); 
        loadUsers();
    };

    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsBatchProcessing(true);
        setUploadLogs(['⏳ Đang đọc file Excel...']);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Headers should be row 0
            const headers = (jsonData[0] as string[]).map(h => h.toLowerCase().trim());
            const rows = jsonData.slice(1);

            setUploadLogs(prev => [`✅ Đã đọc ${rows.length} dòng dữ liệu.`, '⏳ Bắt đầu nhập...', ...prev]);

            let successCount = 0;
            let failCount = 0;

            for (const row of rows) {
                const r = row as any[];
                if (!r || r.length === 0) continue;

                // Map columns (basic mapping)
                // Expected: Full Name | Email | Student Code | Organization | Role | Password
                // Indices depend on file. Let's try to map by header names or assume standard order

                // Helper to get value by rough header match
                const getVal = (keys: string[]) => {
                    const idx = headers.findIndex(h => keys.some(k => h.includes(k)));
                    return idx !== -1 ? r[idx] : undefined;
                };

                const fullName = getVal(['họ tên', 'tên', 'full name', 'name']);
                const email = getVal(['email', 'thư']);
                const code = getVal(['mã', 'code', 'id']);
                const org = getVal(['lớp', 'tổ', 'class', 'org']);
                const roleRaw = getVal(['vai trò', 'role'])?.toString().toLowerCase();
                const birthDateRaw = getVal(['ngày sinh', 'sinh nhật', 'birthday', 'dob']);

                // Defaults
                if (!fullName) {
                    // Skip empty rows
                    continue;
                }

                const role = (roleRaw?.includes('giáo viên') ? 'teacher' :
                    roleRaw?.includes('quản trị') ? 'admin' : 'student') as any;

                const payload = {
                    full_name: fullName,
                    email: email || `${code || Date.now()}@school.edu.vn`, // Dummy email if missing
                    password: '123', // Default password
                    student_code: code?.toString() || '',
                    organization: org?.toString() || '',
                    birth_date: birthDateRaw ? new Date(birthDateRaw).toISOString() : null, // Handle date parsing carefully if needed
                    role: role,
                    status: 'active' as const
                };

                // Check existing by code
                let exists = false;
                if (payload.student_code) {
                    // Use maybeSingle to avoid 406 error if record not found
                    const { data: exUser, error: findError } = await supabase
                        .from('users')
                        .select('id')
                        .eq('student_code', payload.student_code)
                        .maybeSingle();

                    if (findError) {
                        console.error('Error checking user existence:', findError);
                    }
                    if (exUser) exists = true;
                }

                if (!exists) {
                    const res = await dataService.createUser(payload);
                    if (res.success) {
                        setUploadLogs(prev => [`Đã thêm: ${payload.full_name}`, ...prev]);
                        successCount++;
                    } else {
                        console.error('Create User Error:', res.error);
                        setUploadLogs(prev => [`Lỗi thêm ${payload.full_name}: ${JSON.stringify(res.error)}`, ...prev]);
                        failCount++;
                    }
                } else {
                    setUploadLogs(prev => [`Bỏ qua (Đã tồn tại): ${payload.full_name} (${payload.student_code})`, ...prev]);
                }
            }
            setUploadLogs(prev => [`---`, `HOÀN TẤT NHẬP DỮ LIỆU`, `Thêm mới: ${successCount}`, `Bỏ qua/Lỗi: ${failCount}`, `Vui lòng kiểm tra chi tiết bên dưới.`, ...prev]);

            if (failCount === 0) success(`Đã xử lý xong ${successCount} người dùng!`);
            else info(`Đã xong. Có ${failCount} trường hợp cần lưu ý.`);

        } catch (error: any) {
            console.error('Batch Process Error:', error);
            setUploadLogs(prev => [`❌ Lỗi nghiêm trọng: ${error.message}`, ...prev]);
            toastError('Có lỗi xảy ra: ' + error.message);
        } finally {
            setIsBatchProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
            loadUsers();
            // Modal remains open for review
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({
            email: user.email || '',
            password: '',
            full_name: user.full_name,
            student_code: user.student_code || '',
            role: user.role,
            class_id: user.class_id || '',
            room_id: user.room_id || '',
            // Find zone from room if possible, otherwise use user's zone
            zone: (() => {
                if (user.room_id) {
                    const r = rooms.find(rm => rm.id === user.room_id);
                    if (r) return r.zone;
                }
                return user.zone || ''; // Fallback to user's stored zone if any
            })(),
            organization: user.organization || '',
            birth_date: user.birth_date ? new Date(user.birth_date).toISOString().split('T')[0] : '', // Format YYYY-MM-DD
            status: user.status,
            avatar_url: user.avatar_url || ''
        });
        setShowModal(true);
    };

    const handleAdd = () => {
        setEditingUser(null);
        setFormData({
            email: '',
            password: '',
            full_name: '',
            student_code: '',
            role: 'student',
            class_id: '',
            room_id: '',
            organization: '',
            birth_date: '',
            status: 'active',
            avatar_url: ''
        });
        setShowModal(true);
    };

    const handleResetPassword = async (user: User) => {
        setConfirmModal({
            show: true,
            title: 'Reset Mật khẩu',
            message: `Bạn có chắc chắn muốn đặt lại mật khẩu cho ${user.full_name} về mặc định '123456'?`,
            type: 'warning',
            onConfirm: async () => {
                try {
                    const result = await dataService.updateUser(user.id, { password: '123456' } as any);
                    if (result.success) {
                        success(`Đã reset mật khẩu cho ${user.full_name} thành công!`);
                        setConfirmModal(prev => ({ ...prev, show: false }));
                    } else {
                        toastError(`Lỗi reset mật khẩu: ${result.error}`);
                    }
                } catch (error: any) {
                    toastError(`Lỗi không mong muốn: ${error.message}`);
                }
            }
        });
    };

    const handleDelete = async (user: User) => {
        if (user.role === 'admin') {
            toastError('Không được phép xóa tài khoản Quản trị viên!');
            return;
        }

        setConfirmModal({
            show: true,
            title: 'Xóa Người dùng',
            message: `Bạn có chắc muốn xóa người dùng "${user.full_name}"? Hành động này không thể hoàn tác.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    const result = await dataService.deleteUser(user.id);
                    if (result.success) {
                        setUsers(prev => prev.filter(u => u.id !== user.id));
                        success('Xóa thành công!');
                        setConfirmModal(prev => ({ ...prev, show: false }));
                    } else {
                        toastError('Lỗi khi xóa: ' + result.error);
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        });
    };

    const filteredUsers = users; // Filtering is now done on server-side


    const getRoleBadge = (role: string) => {
        const badges: Record<string, { text: string; color: string }> = {
            admin: { text: 'Quản trị', color: 'bg-purple-100 text-purple-600' },
            teacher: { text: 'Giáo viên', color: 'bg-blue-100 text-blue-600' },
            student: { text: 'Học sinh', color: 'bg-emerald-100 text-emerald-600' },
            guest: { text: 'Khách', color: 'bg-slate-100 text-slate-600' }
        };
        return badges[role] || badges.guest;
    };

    if (isLoading) return <div className="p-10 text-center">Đang tải...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Icons.Users className="w-8 h-8 text-indigo-500" />
                        Quản lý Người dùng
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Quản lý tài khoản và ảnh thẻ định danh</p>
                </div>
                <div className="flex gap-2">
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                            ← Quay lại
                        </button>
                    )}
                    <button
                        onClick={() => setShowExcelModal(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center gap-2"
                    >
                        <Icons.FileExcel className="w-5 h-5" />
                        Nhập Excel
                    </button>
                    <button
                        onClick={() => setShowBatchModal(true)}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center gap-2"
                    >
                        <Icons.Upload className="w-5 h-5" />
                        Tải ảnh hàng loạt
                    </button>
                    <button
                        onClick={handleAdd}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center gap-2"
                    >
                        <Icons.Plus className="w-5 h-5" strokeWidth={3} />
                        Thêm người dùng
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                    <input
                        type="text"
                        placeholder="Tìm theo tên, email hoặc mã số..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 overflow-x-auto scrollbar-hide w-full md:w-fit">
                    {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'admin', label: 'Quản trị' },
                        { id: 'teacher', label: 'Giáo viên' },
                        { id: 'student', label: 'Học sinh' }
                    ].map(role => (
                        <button
                            key={role.id}
                            onClick={() => setFilterRole(role.id)}
                            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all ${filterRole === role.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            {role.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] md:min-w-0">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Họ tên / Ảnh</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Mã số</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Vai trò</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Ngày sinh</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Lớp/Tổ/Phòng</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Không tìm thấy dữ liệu</td></tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                                                    {user.avatar_url ? (
                                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                            <Icons.User className="w-6 h-6" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-bold text-slate-900">{user.full_name}</p>
                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-slate-600">{user.student_code || '—'}</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${getRoleBadge(user.role).color}`}>{getRoleBadge(user.role).text}</span></td>
                                        <td className="px-4 py-3 text-slate-600">{user.birth_date ? new Date(user.birth_date).toLocaleDateString('vi-VN') : '—'}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            <div className="flex flex-col">
                                                <span className="font-bold">{user.class_id || user.organization || '—'}</span>
                                                {user.room_id && (() => {
                                                    const r = rooms.find(room => room.id === user.room_id);
                                                    if (!r) return null;
                                                    return (
                                                        <div className="flex items-center gap-1 mt-1 text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded-lg w-fit">
                                                            <Icons.Home className="w-3 h-3" />
                                                            <span>{r.name} - Khu {r.zone}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={() => handleResetPassword(user)}
                                                    className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg"
                                                    title="Reset mật khẩu về 123456"
                                                >
                                                    <Icons.Key className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => handleEdit(user)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                                    <Icons.Edit className="w-5 h-5" />
                                                </button>
                                                {user.email !== 'admin@educheck.com' && (
                                                    <button onClick={() => handleDelete(user)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                                                        <Icons.Trash className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination UI */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-sm font-medium text-slate-500">
                        Hiển thị <span className="text-slate-900 font-bold">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalUsers)}</span> trong tổng số <span className="text-slate-900 font-bold">{totalUsers}</span> người dùng
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 mr-4">
                            <span className="text-xs font-bold text-slate-400 uppercase">Hiển thị:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>

                        <div className="flex gap-1">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                            >
                                <Icons.ChevronLeft className="w-5 h-5" />
                            </button>

                            {/* Page Numbers */}
                            <div className="flex gap-1">
                                {(() => {
                                    const totalPages = Math.ceil(totalUsers / pageSize);
                                    const pages = [];
                                    const maxVisible = 5;

                                    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                                    let end = Math.min(totalPages, start + maxVisible - 1);

                                    if (end - start + 1 < maxVisible) {
                                        start = Math.max(1, end - maxVisible + 1);
                                    }

                                    for (let i = start; i <= end; i++) {
                                        pages.push(
                                            <button
                                                key={i}
                                                onClick={() => setCurrentPage(i)}
                                                className={`w-10 h-10 rounded-xl font-bold transition-all ${currentPage === i ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                {i}
                                            </button>
                                        );
                                    }
                                    return pages;
                                })()}
                            </div>

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalUsers / pageSize), prev + 1))}
                                disabled={currentPage >= Math.ceil(totalUsers / pageSize)}
                                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                            >
                                <Icons.ChevronLeft className="w-5 h-5 rotate-180" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Single Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="text-2xl font-black text-slate-900 mb-6">{editingUser ? 'Cập nhật người dùng' : 'Thêm người dùng mới'}</h3>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="flex gap-6">
                                {/* Left: Avatar Upload */}
                                <div className="w-1/3">
                                    <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 relative group cursor-pointer hover:border-indigo-500 transition-colors"
                                        onClick={() => fileInputRef.current?.click()}>
                                        {formData.avatar_url ? (
                                            <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 group-hover:text-indigo-500 transition-colors">
                                                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-2 group-hover:bg-indigo-50 transition-colors">
                                                    <Icons.Camera className="w-6 h-6" />
                                                </div>
                                                <span className="text-xs font-bold">Thêm ảnh</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-sm">Thay đổi</div>
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleSingleFileUpload} />
                                    <div className="text-center mt-2">
                                        <p className="text-xs text-slate-500">Mã số: <span className="font-mono font-bold text-slate-700">{formData.student_code || 'Chưa có'}</span></p>
                                    </div>
                                </div>

                                {/* Right: Fields */}
                                <div className="flex-1 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Họ và tên *</label>
                                            <input type="text" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} required className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 font-bold" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Mã số (ID) *</label>
                                            <input type="text" value={formData.student_code} onChange={e => setFormData({ ...formData, student_code: e.target.value })} required placeholder="VD: SV001" className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 font-mono" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Email *</label>
                                        <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required className="w-full p-3 rounded-xl border border-slate-200" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Ngày sinh</label>
                                        <input type="date" value={formData.birth_date} onChange={e => setFormData({ ...formData, birth_date: e.target.value })} className="w-full p-3 rounded-xl border border-slate-200" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Vai trò</label>
                                            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="w-full p-3 rounded-xl border border-slate-200">
                                                <option value="student">Học sinh</option>
                                                <option value="teacher">Giáo viên</option>
                                                <option value="admin">Quản trị</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Trạng thái</label>
                                            <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full p-3 rounded-xl border border-slate-200">
                                                <option value="active">Hoạt động</option>
                                                <option value="inactive">Đã khóa</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Lớp/Tổ</label>
                                            <input type="text" value={formData.organization} onChange={e => setFormData({ ...formData, organization: e.target.value })} placeholder="12A1" className="w-full p-3 rounded-xl border border-slate-200" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Phòng nội trú</label>
                                            <select
                                                value={formData.room_id}
                                                onChange={e => {
                                                    const roomId = e.target.value;
                                                    const selectedRoom = rooms.find(r => r.id === roomId);
                                                    setFormData({
                                                        ...formData,
                                                        room_id: roomId,
                                                        zone: selectedRoom ? selectedRoom.zone : formData.zone
                                                    });
                                                }}
                                                className="w-full p-3 rounded-xl border border-slate-200"
                                            >
                                                <option value="">-- Chọn phòng --</option>
                                                {rooms.map(room => (
                                                    <option key={room.id} value={room.id}>
                                                        {room.name} (Khu {room.zone}) - {room.capacity} chỗ
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Khu vực</label>
                                            <input type="text" value={formData.zone} onChange={e => setFormData({ ...formData, zone: e.target.value })} placeholder="A" className="w-full p-3 rounded-xl border border-slate-200" />
                                        </div>
                                    </div>
                                    {!editingUser && (
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Mật khẩu</label>
                                            <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Mặc định: 123456" className="w-full p-3 rounded-xl border border-slate-200" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-4 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 flex-1">Hủy</button>
                                <button type="submit" disabled={isSubmitting} className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex-1">
                                    {isSubmitting ? 'Đang lưu...' : 'Lưu thông tin'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Batch Upload Modal */}
            {showBatchModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
                        <h3 className="text-xl font-black text-slate-900 mb-4">Tải ảnh thẻ hàng loạt</h3>
                        <div className="space-y-4 flex-1 overflow-y-auto min-h-[300px]">
                            <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl text-sm leading-relaxed border border-indigo-100">
                                <p className="font-bold mb-2 flex items-center gap-2">
                                    <Icons.Info className="w-4 h-4" />
                                    Hướng dẫn:
                                </p>
                                <ul className="list-disc pl-5 space-y-1 text-indigo-700/80">
                                    <li>Đặt tên file ảnh trùng với <strong>Mã số</strong> (ví dụ: <code>SV001.jpg</code>).</li>
                                    <li>Hệ thống sẽ tự động tìm user có mã <code>SV001</code> và cập nhật ảnh.</li>
                                </ul>
                            </div>

                            {!batchFiles ? (
                                <div className="border-2 border-dashed border-slate-300 rounded-2xl h-80 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-slate-50 transition-all cursor-pointer group"
                                    onClick={() => document.getElementById('batchInput')?.click()}>
                                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-sm group-hover:shadow-md">
                                        <Icons.Upload className="w-10 h-10 text-indigo-600" />
                                    </div>
                                    <p className="font-bold text-lg text-slate-700 group-hover:text-indigo-700 transition-colors">Tải ảnh lên từ máy tính</p>
                                    <p className="text-sm text-slate-500 mt-2">Kéo thả hoặc click để chọn file</p>
                                    <input id="batchInput" type="file" multiple className="hidden" accept="image/*" onChange={(e) => setBatchFiles(e.target.files)} />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-slate-100 p-3 rounded-xl border border-slate-200">
                                        <span className="font-bold text-slate-700">Đã chọn {batchFiles.length} file</span>
                                        <button onClick={() => setBatchFiles(null)} className="text-red-500 font-bold hover:text-red-600 text-sm">Hủy</button>
                                    </div>
                                    <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-xs h-64 overflow-y-auto space-y-1">
                                        {uploadLogs.length === 0 ? <p className="text-slate-500 italic">Nhấn "Tải lên" để hoàn thành...</p> : uploadLogs.map((log, i) => <p key={i}>{log}</p>)}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-slate-100 mt-4">
                            <button onClick={() => setShowBatchModal(false)} className="px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 flex-1">Đóng</button>
                            {batchFiles && !isBatchProcessing && (
                                <button onClick={handleBatchProcess} className="px-4 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex-1 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
                                    Tải lên ngay
                                    <Icons.ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Excel Import Modal */}
            {showExcelModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
                        <h3 className="text-xl font-black text-slate-900 mb-4">Nhập Người dùng từ Excel</h3>
                        <div className="space-y-4 flex-1 overflow-y-auto min-h-[300px]">
                            <div className="bg-slate-50 text-slate-800 p-4 rounded-xl text-sm leading-relaxed border border-slate-200">
                                <p className="font-bold mb-2 flex items-center gap-2 text-indigo-600">
                                    <Icons.FileText className="w-4 h-4" />
                                    Cấu trúc file Excel:
                                </p>
                                <p className="mb-2 text-slate-500">Hàng đầu tiên là tiêu đề. Các cột cần thiết:</p>
                                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                    <li><strong>Họ tên</strong> (Bắt buộc)</li>
                                    <li><strong>Mã số</strong> (ID, Code)</li>
                                    <li><strong>Ngày sinh</strong> (Birthday, DOB)</li>
                                    <li><strong>Lớp</strong> (Tổ, Organization)</li>
                                    <li><strong>Vai trò</strong> (Học sinh/Giáo viên/Quản trị)</li>
                                    <li><strong>Email</strong> (Mặc định: <code>mã@school.edu.vn</code>)</li>
                                </ul>
                                <button
                                    onClick={() => {
                                        const wb = XLSX.utils.book_new();
                                        const ws = XLSX.utils.json_to_sheet([
                                            { "Họ tên": "Nguyễn Văn A", "Mã số": "SV001", "Ngày sinh": "2005-01-01", "Lớp": "12A1", "Vai trò": "Học sinh", "Email": "" },
                                            { "Họ tên": "Trần Thị B", "Mã số": "GV002", "Ngày sinh": "1990-05-15", "Lớp": "Tổ Toán", "Vai trò": "Giáo viên", "Email": "gv002@school.edu.vn" }
                                        ]);
                                        XLSX.utils.book_append_sheet(wb, ws, "Danh sách");
                                        XLSX.writeFile(wb, "mau_danh_sach_nguoi_dung.xlsx");
                                    }}
                                    className="mt-3 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 inline-flex items-center gap-1"
                                >
                                    <Icons.FileExcel className="w-4 h-4" />
                                    Tải file mẫu .xlsx
                                </button>
                            </div>

                            {!isBatchProcessing && uploadLogs.length === 0 ? (
                                <div className="border-2 border-dashed border-green-200 rounded-2xl h-80 flex flex-col items-center justify-center text-center hover:border-green-500 hover:bg-green-50/50 transition-all cursor-pointer group"
                                    onClick={() => document.getElementById('excelInput')?.click()}>
                                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-sm group-hover:shadow-md">
                                        <Icons.FileExcel className="w-10 h-10 text-green-600" />
                                    </div>
                                    <p className="font-bold text-lg text-slate-700 group-hover:text-green-700 transition-colors">Chọn file Excel (.xlsx)</p>
                                    <p className="text-sm text-slate-500 mt-2">Nhập danh sách người dùng</p>
                                    <input id="excelInput" type="file" className="hidden" accept=".xlsx, .xls" onChange={handleExcelUpload} />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-slate-100 p-3 rounded-xl border border-slate-200">
                                        <span className="font-bold text-slate-700 animate-pulse">{isBatchProcessing ? "Đang xử lý dữ liệu..." : "Kết quả nhập liệu"}</span>
                                        {!isBatchProcessing && (
                                            <button onClick={() => setUploadLogs([])} className="text-indigo-600 font-bold hover:text-indigo-700 text-sm">Nhập tiếp?</button>
                                        )}
                                    </div>
                                    <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-xs h-64 overflow-y-auto space-y-1">
                                        {uploadLogs.map((log, i) => <p key={i}>{log}</p>)}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-slate-100 mt-4">
                            <button onClick={() => setShowExcelModal(false)} className="px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 flex-1">Đóng</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${confirmModal.type === 'danger' ? 'bg-red-50 text-red-500' :
                            confirmModal.type === 'warning' ? 'bg-amber-50 text-amber-500' :
                                'bg-indigo-50 text-indigo-500'
                            }`}>
                            {confirmModal.type === 'danger' ? <Icons.Trash className="w-8 h-8" /> :
                                confirmModal.type === 'warning' ? <Icons.AlertCircle className="w-8 h-8" /> :
                                    <Icons.Info className="w-8 h-8" />
                            }
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 text-center mb-2">{confirmModal.title}</h3>
                        <p className="text-slate-500 text-center mb-8 font-medium leading-relaxed">
                            {confirmModal.message}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={confirmModal.onConfirm}
                                className={`flex-1 py-4 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95 ${confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-100' :
                                    confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' :
                                        'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-100'
                                    }`}
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;

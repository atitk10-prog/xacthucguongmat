import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { faceService } from '../../services/faceService';
import { supabase } from '../../services/supabaseClient';
import { User } from '../../types';
import { useToast, Icons } from '../ui';

interface FaceIDManagementProps {
    onBack?: () => void;
}

const FaceIDManagement: React.FC<FaceIDManagementProps> = ({ onBack }) => {
    const { success: toastSuccess, error: toastError, info } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterRole, setFilterRole] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'missing' | 'has'>('missing');
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination States
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalUsers, setTotalUsers] = useState(0);

    // Batch processing
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, name: '', phase: '' });
    const [batchResult, setBatchResult] = useState<{ success: number; failed: number; total: number } | null>(null);

    // Model loading state
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);

    // Individual upload
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadUsers();
    }, [currentPage, pageSize, filterRole, filterStatus]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentPage !== 1) setCurrentPage(1);
            else loadUsers();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Pre-load face models on component mount
    useEffect(() => {
        const preloadModels = async () => {
            if (faceService.isModelsLoaded()) {
                setModelsLoaded(true);
                return;
            }
            setLoadingModels(true);
            try {
                await faceService.loadModels();
                setModelsLoaded(true);
            } catch (e) {
                console.error('Failed to preload face models:', e);
            } finally {
                setLoadingModels(false);
            }
        };
        preloadModels();
    }, []);

    // Subscribe to Face ID computation updates
    useEffect(() => {
        const unsubscribe = dataService.onFaceComputeComplete((userId, result) => {
            const user = users.find(u => u.id === userId);
            const name = user?.full_name || 'User';

            if (result.success) {
                toastSuccess(`✅ Face ID: ${name} - Thành công!`);
                setUsers(prev => prev.map(u =>
                    u.id === userId ? { ...u, face_descriptor: 'computed' } as User : u
                ));
            } else {
                toastError(`❌ Face ID: ${name} - ${result.error || 'Thất bại'}`);
            }
        });

        return () => unsubscribe();
    }, [users, toastSuccess, toastError]);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const result = await dataService.getUsers({
                role: filterRole,
                status: 'active', // or whatever default
                missingFaceId: filterStatus === 'missing',
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
        } catch (error) {
            console.error('Failed to load users:', error);
            toastError('Lỗi tải danh sách người dùng');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBatchCompute = async () => {
        setIsBatchProcessing(true);
        setBatchResult(null);
        setBatchProgress({ current: 0, total: 0, name: 'Đang tải AI models...', phase: 'loading' });

        try {
            // Ensure models are loaded first
            if (!faceService.isModelsLoaded()) {
                await faceService.loadModels();
                setModelsLoaded(true);
            }

            setBatchProgress({ current: 0, total: 0, name: 'Bắt đầu xử lý...', phase: 'processing' });

            const result = await dataService.batchComputeFaceDescriptors((current, total, name) => {
                setBatchProgress({ current, total, name, phase: 'processing' });
            });
            setBatchResult(result);

            if (result.success > 0) {
                toastSuccess(`Đã tính toán Face ID cho ${result.success}/${result.total} người dùng`);
                loadUsers(); // Reload to update status
            } else if (result.total === 0) {
                info('Không có người dùng nào cần xử lý (tất cả đã có Face ID hoặc không có ảnh)');
            }
        } catch (e) {
            toastError('Lỗi xử lý batch: ' + e);
        } finally {
            setIsBatchProcessing(false);
        }
    };

    const handleFileSelect = (user: User) => {
        setSelectedUser(user);
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedUser) return;

        setIsUploading(true);
        setUploadProgress('Đang đọc file...');

        try {
            // 1. Read file as base64
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // 2. Detect face
            setUploadProgress('Đang phân tích khuôn mặt (AI)...');
            const img = new Image();
            img.src = base64;
            await new Promise(resolve => img.onload = resolve);

            const descriptor = await faceService.getFaceDescriptor(img);
            if (!descriptor) {
                toastError('Không tìm thấy khuôn mặt trong ảnh!');
                setIsUploading(false);
                return;
            }

            // 3. Upload to Supabase Storage
            setUploadProgress('Đang tải ảnh lên Cloud...');
            const fileExt = file.name.split('.').pop() || 'jpg';
            const fileName = `${selectedUser.student_code || selectedUser.id}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const publicUrl = urlData.publicUrl;

            // 4. Update user with avatar and face_descriptor
            setUploadProgress('Đang lưu dữ liệu...');
            const descriptorStr = faceService.descriptorToString(descriptor);

            const { error: updateError } = await supabase
                .from('users')
                .update({
                    avatar_url: publicUrl,
                    face_descriptor: descriptorStr
                })
                .eq('id', selectedUser.id);

            if (updateError) throw updateError;

            // 5. Update local state
            setUsers(prev => prev.map(u =>
                u.id === selectedUser.id ? { ...u, avatar_url: publicUrl, face_descriptor: descriptorStr } as User : u
            ));

            toastSuccess(`✅ Cập nhật Face ID thành công cho ${selectedUser.full_name}!`);
        } catch (err: any) {
            console.error('Upload error:', err);
            toastError(`Lỗi: ${err.message || 'Không xác định'}`);
        } finally {
            setIsUploading(false);
            setUploadProgress('');
            setSelectedUser(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Filter users
    const filteredUsers = users; // Filtering is now done on server-side


    const stats = {
        total: users.length,
        withFaceID: users.filter(u => u.face_descriptor).length,
        withoutFaceID: users.filter(u => !u.face_descriptor).length,
        withAvatar: users.filter(u => u.avatar_url && !u.face_descriptor).length
    };

    const getRoleBadge = (role: string) => {
        const badges: Record<string, { text: string; color: string }> = {
            admin: { text: 'Quản trị', color: 'bg-purple-100 text-purple-600' },
            teacher: { text: 'Giáo viên', color: 'bg-blue-100 text-blue-600' },
            student: { text: 'Học sinh', color: 'bg-emerald-100 text-emerald-600' },
            guest: { text: 'Khách', color: 'bg-slate-100 text-slate-600' }
        };
        return badges[role] || badges.guest;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Icons.User className="w-6 h-6 md:w-8 md:h-8 text-indigo-500" />
                        Quản lý Face ID
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Xem và cập nhật Face ID cho tất cả người dùng</p>
                </div>
                <div className="flex w-full md:w-auto gap-2">
                    {onBack && (
                        <button onClick={onBack} className="flex-1 md:flex-none px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                            ←
                        </button>
                    )}
                    <button
                        onClick={handleBatchCompute}
                        disabled={isBatchProcessing || stats.withAvatar === 0}
                        className="flex-[3] md:flex-none px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isBatchProcessing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Đang xử lý...
                            </>
                        ) : (
                            <>
                                <Icons.Points className="w-5 h-5" />
                                Batch Compute ({stats.withAvatar})
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                            <Icons.Users className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-slate-900">{stats.total}</p>
                            <p className="text-xs text-slate-500 font-medium">Tổng người dùng</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <Icons.CheckCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-emerald-600">{stats.withFaceID}</p>
                            <p className="text-xs text-slate-500 font-medium">Có Face ID</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                            <Icons.XCircle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-amber-600">{stats.withoutFaceID}</p>
                            <p className="text-xs text-slate-500 font-medium">Thiếu Face ID</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                            <Icons.Camera className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-blue-600">{stats.withAvatar}</p>
                            <p className="text-xs text-slate-500 font-medium">Có ảnh, chưa có Face ID</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Batch Progress */}
            {isBatchProcessing && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="font-bold text-indigo-900">Đang xử lý: {batchProgress.name}</span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2">
                        <div
                            className="bg-indigo-600 h-2 rounded-full transition-all"
                            style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                        ></div>
                    </div>
                    <p className="text-sm text-indigo-600 mt-1">{batchProgress.current} / {batchProgress.total}</p>
                </div>
            )}

            {/* Batch Result */}
            {batchResult && (
                <div className={`rounded-xl p-4 ${batchResult.success > 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
                    <p className="font-bold text-slate-900">
                        🏁 Hoàn tất: {batchResult.success} thành công, {batchResult.failed} thất bại / {batchResult.total} tổng
                    </p>
                </div>
            )}

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
                <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
                    {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'missing', label: 'Thiếu Face ID' },
                        { id: 'has', label: 'Có Face ID' }
                    ].map(status => (
                        <button
                            key={status.id}
                            onClick={() => setFilterStatus(status.id as any)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${filterStatus === status.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            {status.label}
                        </button>
                    ))}
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
                            className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-bold transition-all ${filterRole === role.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            {role.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] md:min-w-0">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Họ tên / Ảnh</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Mã số</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Vai trò</th>
                                <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase">Face ID</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Không có dữ liệu</td></tr>
                            ) : (
                                filteredUsers.slice(0, 50).map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                                                    {user.avatar_url ? (
                                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                            <Icons.User className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-slate-900 truncate">{user.full_name}</p>
                                                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-slate-600">{user.student_code || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getRoleBadge(user.role).color}`}>
                                                {getRoleBadge(user.role).text}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {user.face_descriptor ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
                                                    <Icons.CheckCircle className="w-3 h-3 mr-1" />
                                                    Đã có
                                                </span>
                                            ) : user.avatar_url ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                                                    <Icons.Clock className="w-3 h-3 mr-1" />
                                                    Chưa xử lý
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
                                                    Không có ảnh
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleFileSelect(user)}
                                                disabled={isUploading}
                                                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-200 disabled:opacity-50"
                                            >
                                                <Icons.Upload className="w-4 h-4 inline mr-1" />
                                                Cập nhật
                                            </button>
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

                            <div className="flex gap-1">
                                {(() => {
                                    const totalPages = Math.ceil(totalUsers / pageSize);
                                    if (totalPages <= 1) return null;

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

            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
            />

            {/* Upload Progress Modal */}
            {isUploading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <h3 className="text-xl font-bold mb-2">Đang xử lý</h3>
                        <p className="text-slate-500">{uploadProgress}</p>
                        {selectedUser && (
                            <p className="text-sm text-indigo-600 font-bold mt-2">{selectedUser.full_name}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FaceIDManagement;

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { dataService } from '../../services/dataService';
import { User, BoardingConfig, BoardingTimeSlot } from '../../types';
import { faceService } from '../../services/faceService';
import { supabase } from '../../services/supabaseClient';
import { Icons, useToast } from '../ui';
import RoomManagement from './RoomManagement';
import ExitPermission from './ExitPermission';
import BoardingReport from './BoardingReport';
import BoardingDashboard from './BoardingDashboard';

// Simple UI Components
const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
        {children}
    </div>
);

const Button = ({ onClick, isLoading, icon, children, variant = 'primary' }: { onClick: () => void, isLoading?: boolean, icon?: React.ReactNode, children: React.ReactNode, variant?: 'primary' | 'secondary' }) => (
    <button
        onClick={onClick}
        disabled={isLoading}
        className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${variant === 'primary' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
    >
        {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        ) : icon}
        {children}
    </button>
);

// Custom Time Picker to ensure AM/PM display
const CustomTimePicker = ({ value, onChange, className = '' }: { value: string, onChange: (val: string) => void, className?: string }) => {
    // Ensure value is never undefined/empty - use default '00:00'
    const safeValue = value || '00:00';
    const parts = safeValue.split(':');
    const hour24 = parseInt(parts[0] || '0', 10);
    const minute = parseInt(parts[1] || '0', 10);
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

    const selectClass = "bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-slate-100 cursor-pointer text-center appearance-none";

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

// --- 1. Config Tab Component (Original BoardingConfigPage content) ---

const BoardingConfigTab: React.FC<{
    currentUser: User;
    teacherPermissions: any[]
}> = ({ currentUser, teacherPermissions }) => {
    const { success: toastSuccess, error: toastError } = useToast();

    // Determine permissions
    const modulePerm = teacherPermissions?.find(p => p.module_id === 'boarding');
    const isAdmin = currentUser.role === 'admin';
    const canEdit = isAdmin || (modulePerm?.is_enabled && modulePerm?.can_edit);
    const canDelete = isAdmin || (modulePerm?.is_enabled && modulePerm?.can_delete);

    const [config, setConfig] = useState<BoardingConfig>({
        morning_curfew: '07:00',
        noon_curfew: '12:30',
        evening_curfew: '22:00'
    });
    const [students, setStudents] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Time Slots State (NEW)
    const [timeSlots, setTimeSlots] = useState<BoardingTimeSlot[]>([]);
    const [showSlotModal, setShowSlotModal] = useState(false);
    const [editingSlot, setEditingSlot] = useState<Partial<BoardingTimeSlot> | null>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Action States
    const [showFaceModal, setShowFaceModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processLog, setProcessLog] = useState<string>('');

    // Edit Form State
    const [editForm, setEditForm] = useState<Partial<User>>({});

    // Batch Face ID Compute State
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, name: '' });
    const [batchResult, setBatchResult] = useState<{ success: number; failed: number; total: number } | null>(null);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);

    const handleBatchComputeFaceID = async () => {
        setShowBatchModal(true);
        setIsBatchProcessing(true);
        setBatchResult(null);
        setBatchProgress({ current: 0, total: 0, name: 'Đang khởi tạo...' });

        try {
            const result = await dataService.batchComputeFaceDescriptors((current, total, name) => {
                setBatchProgress({ current, total, name });
            });
            setBatchResult(result);

            if (result.success > 0) {
                toastSuccess(`Đã tính toán Face ID cho ${result.success}/${result.total} học sinh`);
                // Reload students to update face_descriptor status
                loadData();
            }
        } catch (e) {
            toastError('Lỗi xử lý batch: ' + e);
        } finally {
            setIsBatchProcessing(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Subscribe to Face ID computation updates
    useEffect(() => {
        const unsubscribe = dataService.onFaceComputeComplete((userId, result) => {
            const student = students.find(s => s.id === userId);
            const name = student?.full_name || 'Học sinh';

            if (result.success) {
                toastSuccess(`✅ Face ID: ${name} - Thành công!`);
                // Update local state
                setStudents(prev => prev.map(s =>
                    s.id === userId ? { ...s, face_descriptor: 'computed' } as User : s
                ));
            } else {
                toastError(`❌ Face ID: ${name} - ${result.error || 'Thất bại'}`);
            }
        });

        return () => unsubscribe();
    }, [students, toastSuccess, toastError]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load Config (legacy)
            const configRes = await dataService.getBoardingConfig();
            if (configRes.success && configRes.data) {
                setConfig(configRes.data);
            }

            // Load Time Slots (NEW)
            const slotsRes = await dataService.getTimeSlots();
            if (slotsRes.success && slotsRes.data) {
                setTimeSlots(slotsRes.data);
            }

            // Load ALL Students (requireFaceId = false)
            const studentsRes = await dataService.getAllStudentsForCheckin(false);
            if (studentsRes.success && studentsRes.data) {
                const sorted = studentsRes.data.sort((a, b) => {
                    if (!a.organization) return 1;
                    if (!b.organization) return -1;
                    return a.organization.localeCompare(b.organization, undefined, { numeric: true, sensitivity: 'base' });
                });
                setStudents(sorted);
            }
        } catch (error) {
            console.error('Failed to load boarding data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await dataService.updateBoardingConfig(config);
            if (res.success) {
                toastSuccess('Cập nhật cấu hình thành công!');
            } else {
                toastError('Lỗi cập nhật: ' + res.error);
            }
        } catch (error) {
            toastError('Lỗi kết nối');
        } finally {
            setIsSaving(false);
        }
    };

    // --- ACTIONS ---

    const handleDeleteUser = async (user: User) => {
        if (!confirm(`Bạn có chắc muốn xóa học sinh ${user.full_name} khỏi hệ thống?`)) return;

        try {
            const res = await dataService.deleteUser(user.id);
            if (res.success) {
                setStudents(prev => prev.filter(u => u.id !== user.id));
                toastSuccess(`Đã xóa ${user.full_name}`);
            } else {
                toastError('Lỗi xóa: ' + res.error);
            }
        } catch (e) { toastError('Lỗi hệ thống'); }
    };

    const openEditModal = (user: User) => {
        setSelectedUser(user);
        setEditForm({
            full_name: user.full_name,
            email: user.email,
            student_code: user.student_code,
            organization: user.organization,
            birth_date: user.birth_date
        });
        setShowEditModal(true);
    };

    const handleUpdateUser = async () => {
        if (!selectedUser) return;
        setIsProcessing(true);
        try {
            const res = await dataService.updateUser(selectedUser.id, editForm);
            if (res.success) {
                setStudents(prev => prev.map(u => u.id === selectedUser.id ? { ...u, ...editForm } as User : u));
                setShowEditModal(false);
                toastSuccess('Cập nhật thông tin thành công!');
            } else {
                toastError('Lỗi cập nhật: ' + res.error);
            }
        } catch (e) { toastError('Lỗi kết nối'); }
        finally { setIsProcessing(false); }
    };

    const openFaceModal = (user: User) => {
        setSelectedUser(user);
        setProcessLog('');
        setShowFaceModal(true);
    };

    const handleFaceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedUser) return;

        setIsProcessing(true);
        setProcessLog('Đang đọc file...');

        try {
            // 1. Read File
            const imgUrl = URL.createObjectURL(file);
            const img = new Image();
            img.src = imgUrl;
            await new Promise(resolve => img.onload = resolve);

            // 2. Detect Face
            setProcessLog('Đang phân tích khuôn mặt (AI)...');
            const descriptor = await faceService.getFaceDescriptor(img);

            if (!descriptor) {
                setProcessLog('❌ Không tìm thấy khuôn mặt! Vui lòng chọn ảnh rõ mặt hơn.');
                setIsProcessing(false);
                return;
            }

            // 3. Upload Image to Storage
            setProcessLog('Đang tải ảnh lên Cloud...');
            const fileExt = file.name.split('.').pop();
            const fileName = `${selectedUser.student_code || selectedUser.id}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const publicUrl = urlData.publicUrl;

            // 4. Update User
            setProcessLog('Đang lưu dữ liệu...');
            const descriptorStr = faceService.descriptorToString(descriptor);

            const { error: updateError } = await supabase
                .from('users')
                .update({
                    avatar_url: publicUrl,
                    face_descriptor: descriptorStr
                })
                .eq('id', selectedUser.id);

            if (updateError) throw updateError;

            // 5. Update Local State
            setStudents(prev => prev.map(u =>
                u.id === selectedUser.id ? { ...u, avatar_url: publicUrl, face_descriptor: descriptorStr } : u
            ));

            setProcessLog('✅ Cập nhật Face ID thành công!');
            setTimeout(() => setShowFaceModal(false), 1500);

        } catch (err: any) {
            console.error(err);
            setProcessLog(`❌ Lỗi: ${err.message || 'Không xác định'}`);
        } finally {
            setIsProcessing(false);
            // e.target.value = ''; // Reset input // Cannot reset easily here without ref, but okay
        }
    };

    // Pagination Logic
    const totalPages = Math.ceil(students.length / ITEMS_PER_PAGE);
    const paginatedStudents = students.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 truncate">Cấu hình & Danh sách</h2>
                    <p className="text-slate-500 text-sm sm:text-base truncate">Thiết lập giờ giới nghiêm và quản lý học sinh nội trú</p>
                </div>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    {canEdit && (
                        <Button
                            onClick={handleBatchComputeFaceID}
                            icon={<Icons.User className="w-4 h-4" />}
                            variant="secondary"
                        >
                            <span className="hidden sm:inline">Batch Compute</span>
                            <span className="sm:hidden text-xs">Batch</span>
                        </Button>
                    )}
                    <Button
                        onClick={() => setShowQRModal(true)}
                        icon={<Icons.CheckIn className="w-4 h-4" />}
                        variant="secondary"
                    >
                        Mã QR
                    </Button>
                    <Button
                        onClick={() => window.open('/boarding-run', '_blank')}
                        icon={<Icons.ExternalLink className="w-4 h-4" />}
                        variant="secondary"
                    >
                        Máy chủ
                    </Button>
                    {canEdit && (
                        <Button
                            onClick={handleSave}
                            isLoading={isSaving}
                            icon={<Icons.Save className="w-4 h-4" />}
                        >
                            Lưu
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Col: Time Slots Config */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Icons.Settings className="w-5 h-5 text-indigo-600" />
                                Khung giờ Check-in
                            </h3>
                            {canEdit && (
                                <button
                                    onClick={() => {
                                        setEditingSlot({ name: '', start_time: '06:00', end_time: '07:00', is_active: true, order_index: timeSlots.length + 1 });
                                        setShowSlotModal(true);
                                    }}
                                    className="text-sm text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                                >
                                    <Icons.Plus className="w-4 h-4" /> Thêm mới
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {timeSlots.length === 0 ? (
                                <p className="text-slate-500 text-sm text-center py-4">Chưa có khung giờ nào.</p>
                            ) : (
                                timeSlots.map(slot => (
                                    <div key={slot.id} className={`p-4 rounded-xl border-2 transition-all ${slot.is_active
                                        ? 'bg-indigo-50 border-indigo-200'
                                        : 'bg-slate-50 border-slate-200 opacity-60'
                                        }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-bold text-slate-900">{slot.name}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${slot.is_active
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-200 text-slate-500'
                                                }`}>
                                                {slot.is_active ? 'Đang bật' : 'Tắt'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-600 mb-3">
                                            <span className="font-mono bg-white px-2 py-0.5 rounded border">
                                                {new Date(`2000-01-01T${slot.start_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </span>
                                            <span className="mx-2">→</span>
                                            <span className="font-mono bg-white px-2 py-0.5 rounded border">
                                                {new Date(`2000-01-01T${slot.end_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </span>
                                            <span className="text-xs text-slate-400 ml-2">(trễ sau giờ này)</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {canEdit && (
                                                <button
                                                    onClick={() => {
                                                        setEditingSlot(slot);
                                                        setShowSlotModal(true);
                                                    }}
                                                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                    title="Sửa khung giờ"
                                                >
                                                    <Icons.Edit className="w-4 h-4" />
                                                </button>
                                            )}
                                            {canDelete && !['Buổi Sáng', 'Buổi Trưa', 'Buổi Tối'].includes(slot.name) && (
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`Xóa khung giờ "${slot.name}"?`)) return;
                                                        const res = await dataService.deleteTimeSlot(slot.id);
                                                        if (res.success) {
                                                            setTimeSlots(prev => prev.filter(s => s.id !== slot.id));
                                                            toastSuccess(`Đã xóa khung giờ "${slot.name}"`);
                                                        } else {
                                                            toastError(res.error || 'Lỗi xóa khung giờ');
                                                        }
                                                    }}
                                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                                    title="Xóa khung giờ"
                                                >
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                    <Card className="bg-indigo-50 border-indigo-100 p-4">
                        <div className="flex gap-3">
                            <Icons.Info className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                            <div className="text-sm text-indigo-800">
                                <p className="font-semibold mb-1">Hướng dẫn:</p>
                                <p>Check-in <strong>sau giờ kết thúc</strong> sẽ bị tính là <strong>trễ</strong>. Hệ thống sẽ tự động chọn khung giờ phù hợp khi check-in.</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Col: Student List */}
                <div className="lg:col-span-2">
                    <Card className="overflow-hidden flex flex-col h-full">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                <Icons.Users className="w-5 h-5 text-slate-500" />
                                Danh sách Học sinh ({students.length})
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                    {students.filter(s => s.face_descriptor).length} Face ID
                                </span>
                            </div>
                        </div>

                        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-[400px] md:min-h-[500px]">
                            <table className="w-full min-w-[700px]">
                                <thead className="bg-slate-50 sticky top-0 z-10 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">
                                    <tr>
                                        <th className="px-4 py-3">Học sinh</th>
                                        <th className="px-4 py-3">Mã HS</th>
                                        <th className="px-4 py-3">Lớp/Tổ</th>
                                        <th className="px-4 py-3">Ngày sinh</th>
                                        <th className="px-4 py-3 text-center">Face ID</th>
                                        <th className="px-4 py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedStudents.map(student => (
                                        <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden flex-shrink-0 border border-slate-200 aspect-square">
                                                        {student.avatar_url ? (
                                                            <img src={student.avatar_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-sm bg-slate-100">
                                                                {student.full_name.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="font-bold text-slate-900 text-sm block truncate">{student.full_name}</span>
                                                        <span className="text-[10px] sm:text-xs text-slate-500 truncate block">{student.email || 'Chưa có email'}</span>
                                                    </div>

                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-500 font-mono font-bold bg-slate-50/50 w-fit rounded">{student.student_code || '-'}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-indigo-600">{student.organization || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-slate-600">
                                                {student.birth_date ? new Date(student.birth_date).toLocaleDateString('vi-VN') : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {student.face_descriptor ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
                                                        <Icons.CheckCircle className="w-3 h-3 mr-1" />
                                                        Đã có
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
                                                        Chưa có
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    {canEdit && (
                                                        <>
                                                            <button
                                                                onClick={() => openFaceModal(student)}
                                                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                                                                title="Cập nhật Face ID"
                                                            >
                                                                <Icons.User className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => openEditModal(student)}
                                                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                                                                title="Sửa thông tin"
                                                            >
                                                                <Icons.Edit className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            onClick={() => handleDeleteUser(student)}
                                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                            title="Xóa"
                                                        >
                                                            <Icons.Trash className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {students.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-12 text-center text-slate-500">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Icons.Users className="w-12 h-12 opacity-20" />
                                                    <p>Chưa có dữ liệu học sinh nào.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {students.length > 0 && (
                            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white text-sm">
                                <span className="text-slate-500">
                                    Hiển thị <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, students.length)}</strong> trong <strong>{students.length}</strong> học sinh
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-slate-600"
                                    >
                                        Trước
                                    </button>
                                    <span className="px-3 py-1.5 bg-slate-100 rounded-lg font-bold text-slate-700">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-slate-600"
                                    >
                                        Sau
                                    </button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Edit Modal */}
            {showEditModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 animate-scale-in">
                        <h3 className="text-xl font-bold mb-4">Cập nhật thông tin</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Họ tên</label>
                                <input
                                    className="w-full p-2 border rounded-lg"
                                    value={editForm.full_name || ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Mã HS</label>
                                    <input
                                        className="w-full p-2 border rounded-lg font-mono"
                                        value={editForm.student_code || ''}
                                        onChange={e => setEditForm(prev => ({ ...prev, student_code: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Lớp</label>
                                    <input
                                        className="w-full p-2 border rounded-lg"
                                        value={editForm.organization || ''}
                                        onChange={e => setEditForm(prev => ({ ...prev, organization: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                                <input
                                    className="w-full p-2 border rounded-lg"
                                    value={editForm.email || ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Ngày sinh</label>
                                <input
                                    type="date"
                                    className="w-full p-2 border rounded-lg"
                                    value={editForm.birth_date ? new Date(editForm.birth_date).toISOString().split('T')[0] : ''}
                                    onChange={e => setEditForm(prev => ({ ...prev, birth_date: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg">Hủy</button>
                            <button
                                onClick={handleUpdateUser}
                                disabled={isProcessing}
                                className="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {isProcessing ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Face Modal */}
            {showFaceModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-scale-in text-center">
                        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icons.User className="w-10 h-10 text-indigo-600" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Cập nhật Face ID</h3>
                        <p className="text-slate-500 mb-6">Tải lên ảnh chân dung rõ nét để hệ thống nhận diện khuôn mặt cho <span className="font-bold text-slate-900">{selectedUser.full_name}</span></p>

                        {processLog && (
                            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${processLog.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                {processLog}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setShowFaceModal(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Hủy</button>
                            <label className={`flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                                <Icons.Upload className="w-5 h-5" />
                                {isProcessing ? 'Đang xử lý...' : 'Chọn ảnh'}
                                <input type="file" className="hidden" accept="image/*" onChange={handleFaceUpload} disabled={isProcessing} />
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Time Slot Modal (NEW) */}
            {showSlotModal && editingSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-scale-in">
                        <h3 className="text-xl font-bold mb-4">
                            {editingSlot.id ? 'Sửa khung giờ' : 'Thêm khung giờ mới'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Tên khung giờ</label>
                                <input
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="VD: Điểm danh buổi sáng"
                                    value={editingSlot.name || ''}
                                    onChange={e => setEditingSlot(prev => ({ ...prev!, name: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Giờ bắt đầu</label>
                                    <input
                                        type="time"
                                        className="w-full p-2 border rounded-lg font-mono"
                                        value={editingSlot.start_time || '06:00'}
                                        onChange={e => setEditingSlot(prev => ({ ...prev!, start_time: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Giờ kết thúc (deadline)</label>
                                    <input
                                        type="time"
                                        className="w-full p-2 border rounded-lg font-mono"
                                        value={editingSlot.end_time || '07:00'}
                                        onChange={e => setEditingSlot(prev => ({ ...prev!, end_time: e.target.value }))}
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Check-in sau giờ này = trễ</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="slotActive"
                                    checked={editingSlot.is_active ?? true}
                                    onChange={e => setEditingSlot(prev => ({ ...prev!, is_active: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                                />
                                <label htmlFor="slotActive" className="text-sm font-medium text-slate-700">
                                    Bật khung giờ này
                                </label>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setShowSlotModal(false); setEditingSlot(null); }}
                                className="flex-1 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={async () => {
                                    if (!editingSlot.name) {
                                        toastError('Vui lòng nhập tên khung giờ');
                                        return;
                                    }
                                    setIsProcessing(true);
                                    try {
                                        if (editingSlot.id) {
                                            // Update existing
                                            const res = await dataService.updateTimeSlot(editingSlot.id, editingSlot);
                                            if (res.success && res.data) {
                                                setTimeSlots(prev => prev.map(s => s.id === editingSlot.id ? res.data! : s));
                                                toastSuccess(`Đã cập nhật "${editingSlot.name}"`);
                                            } else {
                                                toastError(res.error || 'Lỗi cập nhật');
                                            }
                                        } else {
                                            // Create new
                                            const res = await dataService.createTimeSlot({
                                                name: editingSlot.name!,
                                                start_time: editingSlot.start_time!,
                                                end_time: editingSlot.end_time!,
                                                is_active: editingSlot.is_active ?? true,
                                                order_index: editingSlot.order_index ?? timeSlots.length + 1
                                            });
                                            if (res.success && res.data) {
                                                setTimeSlots(prev => [...prev, res.data!]);
                                                toastSuccess(`Đã tạo khung giờ "${editingSlot.name}"`);
                                            } else {
                                                toastError(res.error || 'Lỗi tạo khung giờ');
                                            }
                                        }
                                        setShowSlotModal(false);
                                        setEditingSlot(null);
                                    } catch (e: any) {
                                        console.error('Lỗi lưu khung giờ:', e);
                                        toastError(`Lỗi: ${e.message || 'Không xác định'}`);
                                    } finally {
                                        setIsProcessing(false);
                                    }
                                }}
                                disabled={isProcessing}
                                className="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {isProcessing ? 'Đang lưu...' : 'Lưu'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Compute Face ID Modal */}
            {showBatchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-scale-in">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icons.User className="w-8 h-8 text-indigo-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Batch Compute Face ID</h3>
                            <p className="text-slate-500 text-sm mt-1">
                                Tự động tính toán Face ID cho tất cả học sinh có ảnh nhưng chưa có Face ID
                            </p>
                        </div>

                        {isBatchProcessing ? (
                            <div className="space-y-4">
                                <div className="bg-slate-100 rounded-lg p-4">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="font-medium text-slate-700">Đang xử lý...</span>
                                        <span className="font-bold text-indigo-600">
                                            {batchProgress.current}/{batchProgress.total}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600 transition-all duration-300"
                                            style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 truncate">
                                        {batchProgress.name}
                                    </p>
                                </div>
                            </div>
                        ) : batchResult ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-slate-50 rounded-lg p-3">
                                        <p className="text-2xl font-bold text-slate-900">{batchResult.total}</p>
                                        <p className="text-xs text-slate-500">Tổng cộng</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-lg p-3">
                                        <p className="text-2xl font-bold text-emerald-600">{batchResult.success}</p>
                                        <p className="text-xs text-emerald-600">Thành công</p>
                                    </div>
                                    <div className="bg-red-50 rounded-lg p-3">
                                        <p className="text-2xl font-bold text-red-600">{batchResult.failed}</p>
                                        <p className="text-xs text-red-600">Thất bại</p>
                                    </div>
                                </div>
                                {batchResult.total === 0 && (
                                    <p className="text-center text-slate-500 text-sm">
                                        Không có học sinh nào cần xử lý. Tất cả đã có Face ID hoặc không có ảnh.
                                    </p>
                                )}
                            </div>
                        ) : null}

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowBatchModal(false)}
                                disabled={isBatchProcessing}
                                className="flex-1 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl disabled:opacity-50"
                            >
                                {batchResult ? 'Đóng' : 'Hủy'}
                            </button>
                            {!batchResult && !isBatchProcessing && (
                                <button
                                    onClick={handleBatchComputeFaceID}
                                    className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
                                >
                                    Bắt đầu
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* QR Quick Modal */}
            {showQRModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95">
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center relative overflow-hidden shadow-2xl">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 -z-10"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-50 rounded-full -ml-16 -mb-16 -z-10"></div>

                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">Mã QR Nội trú</h3>
                            <button onClick={() => setShowQRModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                                <Icons.X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 shadow-xl inline-block mb-6 relative group">
                            <QRImage url={`${window.location.origin}/boarding-run?token=EDUCHECK_STAFF`} />
                            <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                                <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg truncate">Mã dành cho cán bộ</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h4 className="font-bold text-slate-900">Điểm danh Nội trú</h4>
                                <p className="text-xs text-slate-500 font-medium">Truy cập nhanh không cần đăng nhập</p>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/boarding-run?token=EDUCHECK_STAFF`;
                                        navigator.clipboard.writeText(url);
                                        toastSuccess('Đã sao chép liên kết!');
                                    }}
                                    className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <Icons.Copy className="w-4 h-4" /> Sao chép liên kết
                                </button>
                            </div>

                            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                Quét để mở máy điểm danh phụ trên điện thoại/máy tính khác của cán bộ quản lý (Không cần đăng nhập tài khoản chính)
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper component for QR image generation
const QRImage = ({ url }: { url: string }) => {
    const [qrData, setQrData] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        QRCode.toDataURL(url, { margin: 1, width: 250 }, (err: any, data: string) => {
            if (!err) setQrData(data);
            setIsLoading(false);
        });
    }, [url]);

    if (isLoading) return <div className="w-[200px] h-[200px] bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">Đang tạo...</div>;
    return <img src={qrData} alt="QR Code" className="w-[200px] h-[200px] object-contain" />;
};

// --- Main Manager Component with Tabs ---
const BoardingManager: React.FC<{
    currentUser: User,
    initialTab?: 'dashboard' | 'config' | 'rooms' | 'exit' | 'report',
    teacherPermissions: any[]
}> = ({ currentUser, initialTab, teacherPermissions }) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'rooms' | 'exit' | 'report'>(initialTab || 'dashboard');

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const tabs = [
        { id: 'dashboard', label: 'Tổng quan', icon: <Icons.Dashboard className="w-4 h-4" /> },
        { id: 'config', label: 'Cấu hình & Check-in', icon: <Icons.Settings className="w-4 h-4" /> },
        { id: 'rooms', label: 'Quản lý Phòng', icon: <Icons.Rooms className="w-4 h-4" /> },
        { id: 'exit', label: 'Xin phép ra ngoài', icon: <Icons.Exit className="w-4 h-4" /> },
        { id: 'report', label: 'Báo cáo', icon: <Icons.Reports className="w-4 h-4" /> }
    ];

    return (
        <div className="space-y-6">
            {/* Header & Tabs */}
            {/* Header & Tabs */}
            <div className="bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100 flex overflow-x-auto w-full no-scrollbar gap-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                    >
                        {tab.icon}
                        <span className="md:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[600px]">
                {activeTab === 'dashboard' && <BoardingDashboard onNavigate={(tab) => setActiveTab(tab as any)} />}
                {activeTab === 'config' && <BoardingConfigTab currentUser={currentUser} teacherPermissions={teacherPermissions} />}
                {activeTab === 'rooms' && <RoomManagement currentUser={currentUser} teacherPermissions={teacherPermissions} />}
                {activeTab === 'exit' && <ExitPermission currentUser={currentUser} teacherPermissions={teacherPermissions} />}
                {activeTab === 'report' && <BoardingReport currentUser={currentUser} teacherPermissions={teacherPermissions} />}
            </div>
        </div>
    );
};

export default BoardingManager;

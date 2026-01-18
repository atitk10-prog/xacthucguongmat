import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { Event, EventType, User } from '../../types';

interface EventFormProps {
    editingEvent?: Event | null;
    onSave: (event: Event) => void;
    onCancel: () => void;
}

// Participant type for new participants
interface NewParticipant {
    id: string;
    full_name: string;
    birth_date?: string;
    address?: string;
    organization?: string;
    avatar_url?: string;
    isNew: boolean;
}

// SVG Icons
const Icons = {
    book: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
    target: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
    home: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
    academic: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>,
    close: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
    warning: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
    users: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
    plus: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
    trash: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
    user: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
    check: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    upload: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>,
};

const EventForm: React.FC<EventFormProps> = ({ editingEvent, onSave, onCancel }) => {
    const [activeTab, setActiveTab] = useState<'info' | 'participants'>('info');
    const [formData, setFormData] = useState({
        name: '', type: 'học_tập' as EventType, start_time: '', end_time: '', location: '',
        target_audience: 'all', late_threshold_mins: 15, points_on_time: 10, points_late: -5,
        points_absent: -10, require_face: false, face_threshold: 40, checkin_mode: 'student' as 'student' | 'event',
        enable_popup: true
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Participant management states
    const [existingUsers, setExistingUsers] = useState<User[]>([]);
    const [selectedExistingUsers, setSelectedExistingUsers] = useState<string[]>([]);
    const [newParticipants, setNewParticipants] = useState<NewParticipant[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddNewForm, setShowAddNewForm] = useState(false);
    const [newParticipantForm, setNewParticipantForm] = useState<Omit<NewParticipant, 'id' | 'isNew'>>({
        full_name: '', birth_date: '', address: '', organization: '', avatar_url: ''
    });

    // New states for improvements
    const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
    const [importNotification, setImportNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [deletingParticipantId, setDeletingParticipantId] = useState<string | null>(null);
    const [editingParticipant, setEditingParticipant] = useState<NewParticipant | null>(null);

    useEffect(() => {
        loadExistingUsers();
        if (editingEvent) {
            setFormData({
                name: editingEvent.name, type: editingEvent.type, start_time: editingEvent.start_time.slice(0, 16),
                end_time: editingEvent.end_time.slice(0, 16), location: editingEvent.location, target_audience: editingEvent.target_audience,
                late_threshold_mins: editingEvent.late_threshold_mins, points_on_time: editingEvent.points_on_time,
                points_late: editingEvent.points_late, points_absent: editingEvent.points_absent,
                require_face: editingEvent.require_face, face_threshold: editingEvent.face_threshold,
                checkin_mode: editingEvent.checkin_mode || 'student',
                enable_popup: editingEvent.enable_popup !== undefined ? editingEvent.enable_popup : true
            });
            if (editingEvent.participants) {
                setSelectedExistingUsers(editingEvent.participants);
            }
            // Load participants from Event_Participants sheet
            loadEventParticipants(editingEvent.id);
        }
    }, [editingEvent]);

    const loadExistingUsers = async () => {
        const result = await dataService.getUsers();
        if (result.success && result.data) setExistingUsers(result.data);
    };

    const loadEventParticipants = async (eventId: string) => {
        setIsLoadingParticipants(true);
        try {
            const result = await dataService.getEventParticipants(eventId);
            if (result.success && result.data) {
                const participants: NewParticipant[] = result.data.map((p: { id?: string; full_name: string; birth_date?: string; organization?: string; address?: string; avatar_url?: string }) => ({
                    id: p.id || `loaded_${Date.now()}`,
                    full_name: p.full_name,
                    birth_date: p.birth_date || '',
                    organization: p.organization || '',
                    address: p.address || '',
                    avatar_url: p.avatar_url || '',
                    isNew: false
                }));
                setNewParticipants(participants);
            }
        } catch (error) {
            console.error('Failed to load event participants:', error);
        } finally {
            setIsLoadingParticipants(false);
        }
    };

    // Delete participant from sheet (for existing participants)
    const deleteParticipantFromSheet = async (participantId: string) => {
        // Find participant to check if it's new (local only) or saved to sheet
        const participant = newParticipants.find(p => p.id === participantId);

        // If participant is new (not saved to sheet yet), just remove locally
        if (!participant || participant.isNew || participantId.startsWith('new_') || participantId.startsWith('import_')) {
            setNewParticipants(prev => prev.filter(p => p.id !== participantId));
            setImportNotification({ type: 'success', message: 'Đã xóa người tham gia' });
            setTimeout(() => setImportNotification(null), 2000);
            return;
        }

        // For saved participants, call Supabase API to delete
        setDeletingParticipantId(participantId);
        try {
            const result = await dataService.deleteEventParticipant(participantId);

            if (result.success) {
                setNewParticipants(prev => prev.filter(p => p.id !== participantId));
                setImportNotification({ type: 'success', message: 'Đã xóa người tham gia' });
                setTimeout(() => setImportNotification(null), 2000);
            } else {
                setImportNotification({ type: 'error', message: result.error || 'Không thể xóa người tham gia' });
                setTimeout(() => setImportNotification(null), 3000);
            }
        } catch (error) {
            console.error('Failed to delete participant:', error);
            // Still remove from local state
            setNewParticipants(prev => prev.filter(p => p.id !== participantId));
            setImportNotification({ type: 'success', message: 'Đã xóa người tham gia (local)' });
            setTimeout(() => setImportNotification(null), 2000);
        } finally {
            setDeletingParticipantId(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            // Combine existing user IDs and new participant IDs
            const allParticipantIds = [...selectedExistingUsers, ...newParticipants.map(p => p.id)];
            const eventData = { ...formData, participants: allParticipantIds };

            const result = editingEvent
                ? await dataService.updateEvent(editingEvent.id, eventData)
                : await dataService.createEvent(eventData);

            if (result.success && result.data) {
                const savedEvent = result.data;

                // Only save TRULY NEW participants (isNew = true)
                const trulyNewParticipants = newParticipants.filter(p => p.isNew);

                if (trulyNewParticipants.length > 0) {
                    const participantsToSave = trulyNewParticipants.map(p => ({
                        id: p.id, // Pass ID so backend knows it's new (starts with 'new_')
                        full_name: p.full_name,
                        birth_date: p.birth_date || '',
                        organization: p.organization || '',
                        address: p.address || '',
                        avatar_url: p.avatar_url || ''
                    }));

                    await dataService.saveEventParticipants(savedEvent.id, participantsToSave);
                }

                onSave(savedEvent);
            } else {
                setError(result.error || 'Có lỗi xảy ra');
            }
        } catch (err) { setError('Lỗi kết nối'); console.error(err); }
        finally { setIsLoading(false); }
    };

    const toggleExistingUser = (userId: string) => {
        setSelectedExistingUsers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const selectAllByRole = (role: string) => {
        const userIds = existingUsers.filter(u => u.role === role).map(u => u.id);
        setSelectedExistingUsers(prev => [...new Set([...prev, ...userIds])]);
    };

    const addNewParticipant = () => {
        if (!newParticipantForm.full_name.trim()) return;
        const newP: NewParticipant = {
            id: `new_${Date.now()}`,
            ...newParticipantForm,
            isNew: true
        };
        setNewParticipants(prev => [...prev, newP]);
        setNewParticipantForm({ full_name: '', birth_date: '', address: '', organization: '', avatar_url: '' });
        setShowAddNewForm(false);
    };

    const removeNewParticipant = (id: string) => {
        setNewParticipants(prev => prev.filter(p => p.id !== id));
    };

    // Update participant info
    const updateParticipant = async (updatedParticipant: NewParticipant) => {
        // Update local state first for immediate UI feedback
        setNewParticipants(prev => prev.map(p =>
            p.id === updatedParticipant.id ? updatedParticipant : p
        ));
        setEditingParticipant(null);

        // If participant already exists in DB (has real UUID), update it immediately
        const isExisting = updatedParticipant.id &&
            !updatedParticipant.id.startsWith('new_') &&
            !updatedParticipant.id.startsWith('import_');

        if (isExisting && editingEvent?.id) {
            try {
                const result = await dataService.saveEventParticipants(editingEvent.id, [{
                    id: updatedParticipant.id,
                    full_name: updatedParticipant.full_name,
                    birth_date: updatedParticipant.birth_date,
                    organization: updatedParticipant.organization,
                    address: updatedParticipant.address,
                    avatar_url: updatedParticipant.avatar_url
                }]);

                if (result.success) {
                    setImportNotification({ type: 'success', message: 'Đã cập nhật thông tin vào cơ sở dữ liệu' });
                } else {
                    setImportNotification({ type: 'error', message: 'Lỗi lưu vào DB: ' + result.error });
                }
            } catch (err) {
                setImportNotification({ type: 'error', message: 'Lỗi kết nối khi lưu' });
            }
        } else {
            setImportNotification({ type: 'success', message: 'Đã cập nhật thông tin (sẽ lưu khi nhấn Cập nhật)' });
        }
        setTimeout(() => setImportNotification(null), 2000);
    };

    // Download Excel template as .xlsx
    const downloadTemplate = async () => {
        try {
            // Dynamic import xlsx library
            const XLSX = await import('xlsx');

            const headers = ['Họ và tên', 'Ngày sinh (DD/MM/YYYY)', 'Đơn vị/Lớp', 'Địa chỉ', 'Email/SĐT'];
            const sampleData = [
                ['Nguyễn Văn A', '01/01/2000', 'Lớp 10A1', '123 Đường ABC, Quận 1', 'vana@email.com'],
                ['Trần Thị B', '15/06/1995', 'Phòng Giáo dục', '456 Đường XYZ, Quận 2', '0901234567'],
            ];

            // Create workbook and worksheet
            const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

            // Set column widths
            ws['!cols'] = [
                { wch: 25 }, // Họ và tên
                { wch: 22 }, // Ngày sinh
                { wch: 20 }, // Đơn vị
                { wch: 30 }, // Địa chỉ
                { wch: 20 }, // Email/SĐT
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');

            // Write to array buffer and create Blob
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            // Create download link with proper filename
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'danh_sach_nguoi_tham_gia_mau.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error creating template:', error);
            alert('Có lỗi khi tạo file mẫu. Vui lòng thử lại.');
        }
    };

    // Export current participants list to Excel
    const exportParticipantsToExcel = async () => {
        if (newParticipants.length === 0) {
            setImportNotification({ type: 'error', message: 'Không có người tham gia để xuất' });
            setTimeout(() => setImportNotification(null), 3000);
            return;
        }

        try {
            const XLSX = await import('xlsx');

            const headers = ['STT', 'Họ và tên', 'Ngày sinh', 'Đơn vị/Lớp', 'Địa chỉ'];
            const data = newParticipants.map((p, index) => [
                index + 1,
                p.full_name,
                p.birth_date ? new Date(p.birth_date).toLocaleDateString('vi-VN') : '',
                p.organization || '',
                p.address || ''
            ]);

            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            ws['!cols'] = [
                { wch: 5 },  // STT
                { wch: 25 }, // Họ và tên
                { wch: 15 }, // Ngày sinh
                { wch: 20 }, // Đơn vị
                { wch: 30 }, // Địa chỉ
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'NguoiThamGia');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `danh_sach_nguoi_tham_gia_${formData.name || 'event'}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setImportNotification({ type: 'success', message: `Đã xuất ${newParticipants.length} người tham gia ra file Excel` });
            setTimeout(() => setImportNotification(null), 3000);
        } catch (error) {
            console.error('Error exporting participants:', error);
            setImportNotification({ type: 'error', message: 'Lỗi khi xuất file Excel' });
            setTimeout(() => setImportNotification(null), 3000);
        }
    };

    // Import from Excel/CSV file
    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

        if (isExcel) {
            // Handle Excel file with xlsx library
            const XLSX = await import('xlsx');
            const reader = new FileReader();
            reader.onload = (event) => {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];

                // Skip header row
                const dataRows = jsonData.slice(1);
                const imported: NewParticipant[] = [];

                dataRows.forEach((row, index) => {
                    if (row[0]) {
                        // Parse date from DD/MM/YYYY format
                        let birthDate = '';
                        if (row[1]) {
                            const dateStr = String(row[1]);
                            const parts = dateStr.split('/');
                            if (parts.length === 3) {
                                birthDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            }
                        }

                        imported.push({
                            id: `import_${Date.now()}_${index}`,
                            full_name: String(row[0]),
                            birth_date: birthDate,
                            organization: String(row[2] || ''),
                            address: String(row[3] || ''),
                            avatar_url: '', // Will add image upload separately
                            isNew: true
                        });
                    }
                });

                setNewParticipants(prev => [...prev, ...imported]);
                e.target.value = '';

                // Show success notification
                if (imported.length > 0) {
                    setImportNotification({ type: 'success', message: `Đã import ${imported.length} người tham gia từ file Excel` });
                    setTimeout(() => setImportNotification(null), 4000);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Handle CSV file
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                const lines = text.split('\n').filter(line => line.trim());

                // Skip header row
                const dataRows = lines.slice(1);
                const imported: NewParticipant[] = [];

                dataRows.forEach((row, index) => {
                    // Parse CSV (handle both comma and semicolon separators)
                    const separator = row.includes(';') ? ';' : ',';
                    const cols = row.split(separator).map(col => col.trim().replace(/^"|"$/g, ''));

                    if (cols[0]) {
                        // Parse date from DD/MM/YYYY format
                        let birthDate = '';
                        if (cols[1]) {
                            const parts = cols[1].split('/');
                            if (parts.length === 3) {
                                birthDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            }
                        }

                        imported.push({
                            id: `import_${Date.now()}_${index}`,
                            full_name: cols[0],
                            birth_date: birthDate,
                            organization: cols[2] || '',
                            address: cols[3] || '',
                            avatar_url: '',
                            isNew: true
                        });
                    }
                });

                setNewParticipants(prev => [...prev, ...imported]);
                e.target.value = '';
            };
            reader.readAsText(file, 'UTF-8');
        }
    };

    // Handle image upload for participant
    const handleImageUpload = (participantId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setNewParticipants(prev => prev.map(p =>
                p.id === participantId ? { ...p, avatar_url: base64 } : p
            ));
        };
        reader.readAsDataURL(file);
    };

    const filteredUsers = existingUsers.filter(user =>
        user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.class_id && user.class_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const eventTypes = [
        { value: 'học_tập', label: 'Học tập', icon: Icons.book },
        { value: 'ngoại_khóa', label: 'Ngoại khóa', icon: Icons.target },
        { value: 'nội_trú', label: 'Nội trú', icon: Icons.home },
        { value: 'tập_huấn', label: 'Tập huấn', icon: Icons.academic }
    ];

    const totalParticipants = selectedExistingUsers.length + newParticipants.length;

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center flex-shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">{editingEvent ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện mới'}</h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Điền đầy đủ thông tin để tạo sự kiện check-in</p>
                </div>
                <button onClick={onCancel} className="w-10 h-10 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-500 hover:text-slate-700">
                    {Icons.close}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-8 flex-shrink-0">
                <button
                    onClick={() => setActiveTab('info')}
                    className={`px-6 py-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'info' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Thông tin sự kiện
                </button>
                <button
                    onClick={() => setActiveTab('participants')}
                    className={`px-6 py-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'participants' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <span>{Icons.users}</span>
                    Người tham gia
                    {totalParticipants > 0 && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs font-bold">{totalParticipants}</span>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-600 text-sm font-medium flex items-center gap-2">
                            {Icons.warning} {error}
                        </div>
                    )}

                    {/* Tab: Event Info */}
                    {activeTab === 'info' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Tên sự kiện *</label>
                                    <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="VD: Hội thảo AI" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Loại sự kiện</label>
                                    <input
                                        type="text"
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as EventType })}
                                        placeholder="VD: Hội nghị, Đào tạo, Sinh hoạt..."
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium mb-2"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        {eventTypes.map(type => (
                                            <button
                                                key={type.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, type: type.value as EventType })}
                                                className={`px-3 py-2 rounded-xl border text-sm font-bold flex items-center gap-1 transition-all ${formData.type === type.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                            >
                                                <span className={formData.type === type.value ? 'text-indigo-600' : 'text-slate-400'}>{type.icon}</span>
                                                {type.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Địa điểm</label>
                                    <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="VD: Hội trường A" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Thời gian bắt đầu *</label>
                                    <input type="datetime-local" required value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">Thời gian kết thúc *</label>
                                    <input type="datetime-local" required value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-6">
                                <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2"><span className="w-1 h-6 bg-indigo-600 rounded-full"></span>Cài đặt Check-in</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-3 mb-4">
                                        <label className="block text-xs font-black text-slate-400 uppercase mb-2">Chế độ điểm danh</label>
                                        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, checkin_mode: 'student' })}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${!formData.checkin_mode || formData.checkin_mode === 'student' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                <span className="text-lg">🎓</span> Học sinh (Tính điểm)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, checkin_mode: 'event' })}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${formData.checkin_mode === 'event' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                <span className="text-lg">📅</span> Sự kiện (Không điểm)
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-slate-400 uppercase mb-2">Thời gian đi muộn (phút)</label>
                                        <input type="number" value={formData.late_threshold_mins} onChange={(e) => setFormData({ ...formData, late_threshold_mins: parseInt(e.target.value) })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                    </div>

                                    {(!formData.checkin_mode || formData.checkin_mode === 'student') && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-black text-slate-400 uppercase mb-2">Điểm đúng giờ</label>
                                                <input type="number" value={formData.points_on_time} onChange={(e) => setFormData({ ...formData, points_on_time: parseInt(e.target.value) })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-slate-400 uppercase mb-2">Điểm đi muộn</label>
                                                <input type="number" value={formData.points_late} onChange={(e) => setFormData({ ...formData, points_late: parseInt(e.target.value) })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="mt-6 p-4 bg-indigo-50 rounded-2xl">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <div><p className="font-bold text-slate-900">Xác nhận khuôn mặt</p><p className="text-sm text-slate-500">Yêu cầu quét khuôn mặt khi check-in</p></div>
                                        <input type="checkbox" checked={formData.require_face} onChange={(e) => setFormData({ ...formData, require_face: e.target.checked })} className="w-6 h-6 rounded accent-indigo-600" />
                                    </label>
                                </div>

                                <div className="mt-4 p-4 bg-emerald-50 rounded-2xl">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <div><p className="font-bold text-slate-900">Popup thành công</p><p className="text-sm text-slate-500">Hiển thị màn hình chúc mừng khi check-in</p></div>
                                        <input type="checkbox" checked={formData.enable_popup} onChange={(e) => setFormData({ ...formData, enable_popup: e.target.checked })} className="w-6 h-6 rounded accent-emerald-600" />
                                    </label>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Tab: Participants */}
                    {activeTab === 'participants' && (
                        <div className="space-y-6">
                            {/* Import Notification Toast */}
                            {importNotification && (
                                <div className={`px-4 py-3 rounded-xl flex items-center gap-2 ${importNotification.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {importNotification.type === 'success' ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                                    )}
                                    <span className="font-medium">{importNotification.message}</span>
                                </div>
                            )}

                            {/* Loading Indicator */}
                            {isLoadingParticipants && (
                                <div className="flex items-center justify-center py-4 bg-indigo-50 rounded-xl">
                                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3"></div>
                                    <span className="text-indigo-600 font-medium">Đang tải danh sách người tham gia...</span>
                                </div>
                            )}
                            {/* Quick Actions */}
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-sm font-bold text-slate-600">Chọn nhanh:</span>
                                <button type="button" onClick={() => selectAllByRole('student')} className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-bold hover:bg-blue-200">
                                    Tất cả học sinh
                                </button>
                                <button type="button" onClick={() => selectAllByRole('teacher')} className="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-xs font-bold hover:bg-purple-200">
                                    Tất cả giáo viên
                                </button>
                                <button type="button" onClick={() => setSelectedExistingUsers([])} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold hover:bg-slate-200">
                                    Bỏ chọn tất cả
                                </button>
                            </div>

                            {/* Search and Add New */}
                            <div className="flex gap-3 flex-wrap">
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm theo tên hoặc lớp..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="flex-1 min-w-[200px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowAddNewForm(true)}
                                    className="px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 flex items-center gap-2"
                                >
                                    {Icons.plus} Thêm mới
                                </button>
                            </div>

                            {/* Excel Import/Export Section */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" />
                                    </svg>
                                    Import / Export Excel
                                </h4>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={downloadTemplate}
                                        className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                        </svg>
                                        Tải file mẫu
                                    </button>
                                    <label className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-200 flex items-center gap-2 cursor-pointer">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                        </svg>
                                        Tải lên danh sách
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls,.csv,.txt"
                                            onChange={handleFileImport}
                                            className="hidden"
                                        />
                                    </label>
                                    {newParticipants.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={exportParticipantsToExcel}
                                            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-200 flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            Xuất Excel ({newParticipants.length})
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Tải file mẫu, điền thông tin và tải lên để import hàng loạt. Hoặc xuất danh sách hiện tại ra Excel.
                                </p>
                            </div>

                            {/* Add New Participant Form */}
                            {showAddNewForm && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
                                    <h4 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
                                        {Icons.user} Thêm người tham gia mới
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Họ và tên *</label>
                                            <input type="text" value={newParticipantForm.full_name} onChange={e => setNewParticipantForm({ ...newParticipantForm, full_name: e.target.value })}
                                                placeholder="VD: Nguyễn Văn A" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Ngày sinh</label>
                                            <input type="date" value={newParticipantForm.birth_date} onChange={e => setNewParticipantForm({ ...newParticipantForm, birth_date: e.target.value })}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Đơn vị / Lớp</label>
                                            <input type="text" value={newParticipantForm.organization} onChange={e => setNewParticipantForm({ ...newParticipantForm, organization: e.target.value })}
                                                placeholder="VD: Lớp 10A1 hoặc Phòng Giáo dục" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Địa chỉ</label>
                                            <input type="text" value={newParticipantForm.address} onChange={e => setNewParticipantForm({ ...newParticipantForm, address: e.target.value })}
                                                placeholder="VD: 123 Đường ABC, Quận XYZ" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Ảnh đại diện</label>
                                            <div className="flex gap-2">
                                                <input type="url" value={newParticipantForm.avatar_url} onChange={e => setNewParticipantForm({ ...newParticipantForm, avatar_url: e.target.value })}
                                                    placeholder="https://... hoặc upload ảnh →" className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl" />
                                                <label className="px-4 py-3 bg-indigo-100 text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-200 cursor-pointer flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                    </svg>
                                                    Upload
                                                    <input type="file" accept="image/*" onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => {
                                                                setNewParticipantForm({ ...newParticipantForm, avatar_url: ev.target?.result as string });
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }} className="hidden" />
                                                </label>
                                            </div>
                                            {newParticipantForm.avatar_url && (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <img src={newParticipantForm.avatar_url} alt="Preview" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-300" />
                                                    <span className="text-xs text-slate-500">Xem trước ảnh</span>
                                                    <button type="button" onClick={() => setNewParticipantForm({ ...newParticipantForm, avatar_url: '' })} className="text-red-500 text-xs hover:underline">Xóa</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <button type="button" onClick={() => setShowAddNewForm(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm">
                                            Hủy
                                        </button>
                                        <button type="button" onClick={addNewParticipant} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 flex items-center gap-2">
                                            {Icons.check} Thêm vào danh sách
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* New Participants List */}
                            {newParticipants.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs">Mới</span>
                                        Người tham gia mới ({newParticipants.length})
                                    </h4>
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                        {newParticipants.map(p => (
                                            <div key={p.id} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                <label className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 overflow-hidden cursor-pointer hover:bg-emerald-200 transition-colors relative group">
                                                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : Icons.user}
                                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                        </svg>
                                                    </div>
                                                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(p.id, e)} className="hidden" />
                                                </label>
                                                <div className="flex-1">
                                                    <p className="font-bold text-slate-900">{p.full_name}</p>
                                                    <p className="text-xs text-slate-500">
                                                        {[p.organization, p.birth_date ? `Sinh: ${new Date(p.birth_date).toLocaleDateString('vi-VN')}` : '', p.address].filter(Boolean).join(' • ')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {/* Edit button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingParticipant(p)}
                                                        className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-100 transition-colors"
                                                        title="Sửa thông tin"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                        </svg>
                                                    </button>
                                                    {/* Delete button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => p.isNew ? removeNewParticipant(p.id) : deleteParticipantFromSheet(p.id)}
                                                        disabled={deletingParticipantId === p.id}
                                                        className={`p-2 rounded-lg transition-colors ${deletingParticipantId === p.id ? 'text-slate-400' : 'text-red-500 hover:bg-red-100'}`}
                                                        title="Xóa"
                                                    >
                                                        {deletingParticipantId === p.id ? (
                                                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                                                        ) : Icons.trash}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Existing Users List */}
                            <div>
                                <h4 className="font-bold text-slate-700 mb-3">
                                    Người dùng trong hệ thống ({selectedExistingUsers.length} đã chọn)
                                </h4>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {filteredUsers.map(user => (
                                        <div
                                            key={user.id}
                                            onClick={() => toggleExistingUser(user.id)}
                                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedExistingUsers.includes(user.id)
                                                ? 'bg-indigo-50 border-2 border-indigo-300'
                                                : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                                                }`}
                                        >
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${selectedExistingUsers.includes(user.id) ? 'bg-indigo-600 text-white' : 'bg-white border-2 border-slate-300'
                                                }`}>
                                                {selectedExistingUsers.includes(user.id) && Icons.check}
                                            </div>
                                            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 overflow-hidden flex-shrink-0">
                                                {user.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : Icons.user}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-900 truncate">{user.full_name}</p>
                                                <p className="text-xs text-slate-500">{user.class_id || user.email || user.role}</p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold flex-shrink-0 ${user.role === 'student' ? 'bg-blue-100 text-blue-600' :
                                                user.role === 'teacher' ? 'bg-purple-100 text-purple-600' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                {user.role === 'student' ? 'Học sinh' : user.role === 'teacher' ? 'Giáo viên' : user.role}
                                            </span>
                                        </div>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <div className="text-center py-8 text-slate-400">
                                            Không tìm thấy người dùng
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Submit Buttons */}
                    <div className="flex gap-4 pt-4 border-t border-slate-100">
                        <button type="button" onClick={onCancel} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200">HỦY BỎ</button>
                        <button type="submit" disabled={isLoading} className={`flex-[2] py-4 rounded-2xl font-black ${isLoading ? 'bg-indigo-400 text-indigo-200 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                            {isLoading ? 'ĐANG LƯU...' : (editingEvent ? 'CẬP NHẬT' : 'TẠO SỰ KIỆN')}
                            {totalParticipants > 0 && !isLoading && ` (${totalParticipants} người)`}
                        </button>
                    </div>
                </form>
            </div>

            {/* Edit Participant Modal */}
            {editingParticipant && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                        <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                            Sửa thông tin người tham gia
                        </h3>

                        <div className="space-y-4">
                            {/* Avatar */}
                            <div className="flex items-center gap-4">
                                <label className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-200 transition-colors relative group border-2 border-dashed border-slate-300">
                                    {editingParticipant.avatar_url ? (
                                        <img src={editingParticipant.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    )}
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                        </svg>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                    setEditingParticipant({ ...editingParticipant, avatar_url: ev.target?.result as string });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                        className="hidden"
                                    />
                                </label>
                                <div className="text-sm text-slate-500">
                                    <p className="font-medium">Ảnh đại diện</p>
                                    <p className="text-xs">Click để thay đổi</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Họ và tên *</label>
                                <input
                                    type="text"
                                    value={editingParticipant.full_name}
                                    onChange={(e) => setEditingParticipant({ ...editingParticipant, full_name: e.target.value })}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Ngày sinh</label>
                                <input
                                    type="date"
                                    value={editingParticipant.birth_date || ''}
                                    onChange={(e) => setEditingParticipant({ ...editingParticipant, birth_date: e.target.value })}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Đơn vị / Tổ chức</label>
                                <input
                                    type="text"
                                    value={editingParticipant.organization || ''}
                                    onChange={(e) => setEditingParticipant({ ...editingParticipant, organization: e.target.value })}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Địa chỉ</label>
                                <input
                                    type="text"
                                    value={editingParticipant.address || ''}
                                    onChange={(e) => setEditingParticipant({ ...editingParticipant, address: e.target.value })}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setEditingParticipant(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={() => updateParticipant(editingParticipant)}
                                disabled={!editingParticipant.full_name.trim()}
                                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-indigo-300"
                            >
                                Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EventForm;

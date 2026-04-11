import React, { useState, useEffect, useRef } from 'react';
import { pdfService } from '../../services/pdfService';
import { qrService } from '../../services/qrService';
import { dataService } from '../../services/dataService';
import { User, Event, EventParticipant } from '../../types';
import {
    CreditCard, GraduationCap, Calendar, Users, Check, X,
    Download, Printer, ChevronLeft, Search, CheckSquare, Square,
    User as UserIcon, QrCode, School, Settings, Upload, Image as ImageIcon, Phone, Clock, Loader2, Palette
} from 'lucide-react';

interface CardGeneratorProps {
    users?: User[];
    event?: Event;
    onBack?: () => void;
}

interface CardSettings {
    schoolLogo: string;
    schoolName: string;
    hotline: string;
    expiryDate: string;
}

const CardGenerator: React.FC<CardGeneratorProps> = ({ users: propUsers, event, onBack }) => {
    const [users, setUsers] = useState<User[]>(propUsers || []);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [cardType, setCardType] = useState<'event' | 'student' | 'teacher'>('student');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(!propUsers);
    const [currentPage, setCurrentPage] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEventId, setSelectedEventId] = useState('');
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([]);
    const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
    const [guestLabel, setGuestLabel] = useState('Đại biểu');
    const [eventCardColor, setEventCardColor] = useState('');  // empty = use default role color
    const usersPerPage = 20;

    // Card settings from DB
    const [cardSettings, setCardSettings] = useState<CardSettings>({
        schoolLogo: '',
        schoolName: '',
        hotline: '',
        expiryDate: '',
    });
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    useEffect(() => {
        if (!propUsers) loadUsers();
        loadSettings();
        loadEvents();
    }, [propUsers]);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const res = await dataService.getUsers();
            if (res.success && res.data) setUsers(res.data);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadSettings = async () => {
        try {
            const res = await dataService.getSchoolSettings();
            if (res.success && res.data) {
                setCardSettings({
                    schoolLogo: res.data.school_logo || '',
                    schoolName: res.data.school_name || '',
                    hotline: res.data.hotline || '',
                    expiryDate: res.data.card_expiry || '',
                });
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setSettingsLoaded(true);
        }
    };

    const loadEvents = async () => {
        try {
            const res = await dataService.getEvents();
            if (res.success && res.data) setEvents(res.data);
        } catch (err) {
            console.error('Failed to load events:', err);
        }
    };

    // Load event participants when event is selected
    const loadEventParticipants = async (eventId: string) => {
        if (!eventId) {
            setEventParticipants([]);
            return;
        }
        setIsLoadingParticipants(true);
        try {
            const res = await dataService.getEventParticipants(eventId);
            if (res.success && res.data) setEventParticipants(res.data);
            else setEventParticipants([]);
        } catch (err) {
            console.error('Failed to load event participants:', err);
            setEventParticipants([]);
        } finally {
            setIsLoadingParticipants(false);
        }
    };

    useEffect(() => {
        if (cardType === 'event' && selectedEventId) {
            loadEventParticipants(selectedEventId);
        }
    }, [selectedEventId]);

    const saveSetting = async (key: string, value: string) => {
        await dataService.updateSchoolSetting(key, value);
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result as string;
            setCardSettings(prev => ({ ...prev, schoolLogo: base64 }));
            await saveSetting('school_logo', base64);
        };
        reader.readAsDataURL(file);
    };

    // Build unified display list
    // For event mode: map EventParticipants to a User-like shape
    // System users (with user_id) keep their original role; external get 'guest'
    const displayList: (User & { _isExternal?: boolean; _qrCode?: string })[] = cardType === 'event'
        ? eventParticipants.map(p => {
            // Find the linked system user to get their real role
            const linkedUser = p.user_id ? users.find(u => u.id === p.user_id) : null;
            // QR: system users reuse their student_code (same QR as regular card)
            // External: use participant qr_code or student_code
            const qrIdent = linkedUser
                ? (linkedUser.student_code || linkedUser.id)
                : (p.qr_code || p.student_code || p.id);
            return {
                id: p.id,
                full_name: p.full_name,
                role: linkedUser?.role || 'guest',
                email: linkedUser?.email || '',
                status: 'active' as const,
                created_at: p.created_at || '',
                avatar_url: p.avatar_url || (p as any).user?.avatar_url || linkedUser?.avatar_url || '',
                student_code: p.student_code || (p as any).user?.student_code || linkedUser?.student_code || '',
                organization: p.organization || linkedUser?.organization || '',
                birth_date: p.birth_date || linkedUser?.birth_date || '',
                _isExternal: !p.user_id,
                _qrCode: qrIdent, // the correct identifier for QR generation
            };
        })
        : users;

    // Filter
    const filteredUsers = displayList.filter(u => {
        const matchesType = cardType === 'teacher'
            ? u.role === 'teacher'
            : (cardType === 'student' ? u.role === 'student' : true);
        const matchesSearch = searchQuery === '' ||
            u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.student_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.organization || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

    useEffect(() => { setCurrentPage(1); }, [searchQuery, cardType, selectedEventId]);

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * usersPerPage,
        currentPage * usersPerPage
    );

    const handleSelectAll = () => {
        if (selectedUsers.length === filteredUsers.length) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(filteredUsers.map(u => u.id));
        }
    };

    const handleSelectUser = (userId: string) => {
        setSelectedUsers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const getCardTitle = () => {
        if (cardType === 'teacher') return 'Thẻ Giáo Viên';
        if (cardType === 'event') return events.find(e => e.id === selectedEventId)?.name || 'Thẻ Sự Kiện';
        return 'Thẻ Học Sinh';
    };

    const handleGenerate = async (mode: 'print' | 'pdf' = 'print') => {
        if (selectedUsers.length === 0) return;
        setIsGenerating(true);
        setProgress(null);

        try {
            const cardHTMLs: string[] = [];
            for (const id of selectedUsers) {
                // Find person from unified displayList
                const person = filteredUsers.find(u => u.id === id);
                if (!person) continue;

                // QR code: for event cards, use _qrCode (preserves original student QR)
                // For regular cards, use student_code or user id
                const qrIdent = (person as any)._qrCode || person.student_code || person.id;
                const qrData = await qrService.generateUserQR(qrIdent);

                // Convert avatar to base64 for PDF export to avoid CORS
                let avatarUrl = person.avatar_url || '';
                if (mode === 'pdf' && avatarUrl && !avatarUrl.startsWith('data:')) {
                    avatarUrl = await pdfService.urlToBase64(avatarUrl);
                }

                const html = pdfService.generateCardHTML({
                    fullName: person.full_name,
                    role: person.role,
                    roleLabel: (cardType === 'event' && (person as any)._isExternal) ? guestLabel : undefined,
                    cardColor: cardType === 'event' && eventCardColor ? eventCardColor : undefined,
                    code: person.student_code || person.id.slice(0, 8),
                    className: person.organization || person.class_id,
                    avatarUrl: avatarUrl,
                    qrCode: qrData,
                    eventName: getCardTitle(),
                    birthDate: person.birth_date,
                    schoolLogo: cardSettings.schoolLogo,
                    schoolName: cardSettings.schoolName,
                    hotline: cardSettings.hotline,
                    expiryDate: cardSettings.expiryDate,
                });
                cardHTMLs.push(html);
            }

            if (cardHTMLs.length > 0) {
                if (mode === 'print') {
                    pdfService.printBatchCards(cardHTMLs);
                } else {
                    await pdfService.downloadBatchCardsAsPDF(
                        cardHTMLs,
                        `The_EduCheck_${new Date().getTime()}.pdf`,
                        (current, total) => setProgress({ current, total })
                    );
                }
            }
        } catch (error) {
            console.error('Failed to generate cards:', error);
        } finally {
            setIsGenerating(false);
            setProgress(null);
        }
    };

    // Generate preview HTML for the first selected user (or a sample)
    const getPreviewHTML = () => {
        const previewUser = selectedUsers.length > 0
            ? filteredUsers.find(u => u.id === selectedUsers[0])
            : null;

        const defaultRole = cardType === 'teacher' ? 'teacher' : (cardType === 'event' ? 'guest' : 'student');
        const isPreviewExternal = previewUser ? (previewUser as any)._isExternal : true;

        return pdfService.generateCardHTML({
            fullName: previewUser?.full_name || 'Nguyễn Văn A',
            role: previewUser?.role || defaultRole,
            roleLabel: (cardType === 'event' && isPreviewExternal) ? guestLabel : undefined,
            cardColor: cardType === 'event' && eventCardColor ? eventCardColor : undefined,
            code: previewUser?.student_code || 'HS001',
            className: previewUser?.organization || 'Lớp 10A1',
            avatarUrl: previewUser?.avatar_url || '',
            qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            eventName: getCardTitle(),
            birthDate: previewUser?.birth_date || '',
            schoolLogo: cardSettings.schoolLogo,
            schoolName: cardSettings.schoolName,
            hotline: cardSettings.hotline,
            expiryDate: cardSettings.expiryDate,
        });
    };

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
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <CreditCard className="w-7 h-7 text-indigo-600" />
                        Tạo Thẻ Tham Gia
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Tạo thẻ QR cho học sinh, giáo viên</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${showSettings
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                    >
                        <Settings className="w-4 h-4" /> Cài đặt thẻ
                    </button>
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 flex items-center gap-2">
                            <ChevronLeft className="w-4 h-4" /> Quay lại
                        </button>
                    )}
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-indigo-600" /> Thông tin trường
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Logo */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">Logo trường</label>
                            <div className="flex items-center gap-3">
                                {cardSettings.schoolLogo ? (
                                    <div className="relative">
                                        <img src={cardSettings.schoolLogo} className="w-14 h-14 rounded-xl object-contain border border-slate-200 bg-slate-50 p-1" />
                                        <button
                                            onClick={async () => {
                                                setCardSettings(prev => ({ ...prev, schoolLogo: '' }));
                                                await saveSetting('school_logo', '');
                                            }}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                                        >×</button>
                                    </div>
                                ) : (
                                    <label className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors bg-slate-50">
                                        <Upload className="w-5 h-5 text-slate-400" />
                                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* School Name */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><School className="w-3 h-3" /> Tên trường</label>
                            <input
                                type="text"
                                value={cardSettings.schoolName}
                                onChange={e => setCardSettings(prev => ({ ...prev, schoolName: e.target.value }))}
                                onBlur={e => saveSetting('school_name', e.target.value)}
                                placeholder="VD: Trường THCS&THPT Nước Oa"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Hotline */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> Hotline</label>
                            <input
                                type="text"
                                value={cardSettings.hotline}
                                onChange={e => setCardSettings(prev => ({ ...prev, hotline: e.target.value }))}
                                onBlur={e => saveSetting('hotline', e.target.value)}
                                placeholder="VD: 0123.456.789"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Expiry */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Hạn thẻ</label>
                            <input
                                type="text"
                                value={cardSettings.expiryDate}
                                onChange={e => setCardSettings(prev => ({ ...prev, expiryDate: e.target.value }))}
                                onBlur={e => saveSetting('card_expiry', e.target.value)}
                                placeholder="VD: 05/2026"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Card Type Selector */}
            <div className="grid grid-cols-3 gap-4">
                <button
                    onClick={() => { setCardType('student'); setSelectedUsers([]); }}
                    className={`p-5 rounded-2xl text-center transition-all flex flex-col items-center gap-3 ${cardType === 'student'
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${cardType === 'student' ? 'bg-white/20' : 'bg-indigo-50'}`}>
                        <GraduationCap className={`w-7 h-7 ${cardType === 'student' ? 'text-white' : 'text-indigo-600'}`} />
                    </div>
                    <div>
                        <p className="font-bold">Thẻ Học sinh</p>
                        <p className={`text-xs ${cardType === 'student' ? 'text-white/70' : 'text-slate-400'}`}>
                            {users.filter(u => u.role === 'student').length} học sinh
                        </p>
                    </div>
                </button>

                <button
                    onClick={() => { setCardType('teacher'); setSelectedUsers([]); }}
                    className={`p-5 rounded-2xl text-center transition-all flex flex-col items-center gap-3 ${cardType === 'teacher'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${cardType === 'teacher' ? 'bg-white/20' : 'bg-emerald-50'}`}>
                        <School className={`w-7 h-7 ${cardType === 'teacher' ? 'text-white' : 'text-emerald-600'}`} />
                    </div>
                    <div>
                        <p className="font-bold">Thẻ Giáo viên</p>
                        <p className={`text-xs ${cardType === 'teacher' ? 'text-white/70' : 'text-slate-400'}`}>
                            {users.filter(u => u.role === 'teacher').length} giáo viên
                        </p>
                    </div>
                </button>

                <button
                    onClick={() => { setCardType('event'); setSelectedUsers([]); }}
                    className={`p-5 rounded-2xl text-center transition-all flex flex-col items-center gap-3 ${cardType === 'event'
                        ? 'bg-amber-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${cardType === 'event' ? 'bg-white/20' : 'bg-amber-50'}`}>
                        <Calendar className={`w-7 h-7 ${cardType === 'event' ? 'text-white' : 'text-amber-600'}`} />
                    </div>
                    <div>
                        <p className="font-bold">Thẻ Sự kiện</p>
                        <p className={`text-xs ${cardType === 'event' ? 'text-white/70' : 'text-slate-400'}`}>
                            Cho sự kiện cụ thể
                        </p>
                    </div>
                </button>
            </div>

            {/* Event Dropdown - only when event type selected */}
            {cardType === 'event' && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <label className="text-xs font-bold text-slate-500 mb-2 block">Chọn sự kiện</label>
                    <select
                        value={selectedEventId}
                        onChange={e => {
                            setSelectedEventId(e.target.value);
                            setSelectedUsers([]);
                        }}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                    >
                        <option value="">-- Chọn sự kiện --</option>
                        {events.map(e => (
                            <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                        ))}
                    </select>
                    {selectedEventId && (
                        <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                {isLoadingParticipants ? (
                                    <span className="text-amber-600 flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải...</span>
                                ) : (
                                    <span className="text-slate-500">Có <strong className="text-amber-600">{eventParticipants.length}</strong> người tham gia
                                        {eventParticipants.filter(p => p.user_id).length > 0 && (
                                            <span className="ml-1">({eventParticipants.filter(p => p.user_id).length} user hệ thống, {eventParticipants.filter(p => !p.user_id).length} người ngoài)</span>
                                        )}
                                    </span>
                                )}
                            </div>
                            {eventParticipants.filter(p => !p.user_id).length > 0 && (
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                        <UserIcon className="w-3 h-3" /> Nhãn in cho người ngoài
                                    </label>
                                    <input
                                        type="text"
                                        value={guestLabel}
                                        onChange={e => setGuestLabel(e.target.value)}
                                        placeholder="VD: Đại biểu, Khách mời, Phụ huynh..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">Nhãn này sẽ hiển thị trên thẻ của người ngoài hệ thống. Học sinh/Giáo viên giữ nguyên.</p>
                                </div>
                            )}
                            {/* Color Picker for Event Cards */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                                    <Palette className="w-3 h-3" /> Màu thẻ sự kiện
                                </label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {[
                                        { color: '', label: 'Mặc định' },
                                        { color: '#d97706', label: 'Vàng' },
                                        { color: '#dc2626', label: 'Đỏ' },
                                        { color: '#059669', label: 'Xanh lá' },
                                        { color: '#4f46e5', label: 'Xanh dương' },
                                        { color: '#7c3aed', label: 'Tím' },
                                        { color: '#0891b2', label: 'Cyan' },
                                        { color: '#be185d', label: 'Hồng' },
                                    ].map(preset => (
                                        <button
                                            key={preset.color}
                                            onClick={() => setEventCardColor(preset.color)}
                                            className={`w-7 h-7 rounded-lg border-2 transition-all ${
                                                eventCardColor === preset.color
                                                    ? 'border-slate-800 scale-110 shadow-md'
                                                    : 'border-slate-200 hover:border-slate-400'
                                            }`}
                                            style={{ background: preset.color || 'linear-gradient(135deg, #d97706, #4f46e5, #059669)' }}
                                            title={preset.label}
                                        />
                                    ))}
                                    <input
                                        type="color"
                                        value={eventCardColor || '#d97706'}
                                        onChange={e => setEventCardColor(e.target.value)}
                                        className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200"
                                        title="Chọn màu tùy chỉnh"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">Màu nền chung cho tất cả thẻ sự kiện. Chọn "Mặc định" để dùng màu theo vai trò.</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Search & Selection Controls */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Tìm theo tên, mã, lớp..."
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <button
                        onClick={handleSelectAll}
                        className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 flex items-center gap-2"
                    >
                        {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 ? (
                            <><X className="w-4 h-4" /> Bỏ chọn</>
                        ) : (
                            <><CheckSquare className="w-4 h-4" /> Chọn tất cả</>
                        )}
                    </button>

                    <span className="text-slate-500">
                        Đã chọn: <strong className="text-indigo-600">{selectedUsers.length}</strong> / {filteredUsers.length}
                    </span>

                    <div className="flex gap-2">
                        <button
                            onClick={() => handleGenerate('pdf')}
                            disabled={selectedUsers.length === 0 || isGenerating}
                            className={`px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${selectedUsers.length === 0 || isGenerating
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg'
                                }`}
                        >
                            {isGenerating && progress ? (
                                <span className="text-xs">{progress.current}/{progress.total}</span>
                            ) : isGenerating ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <Download className="w-5 h-5" />
                            )}
                            <span className="hidden md:inline">Xuất PDF</span>
                        </button>

                        <button
                            onClick={() => handleGenerate('print')}
                            disabled={selectedUsers.length === 0 || isGenerating}
                            className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${selectedUsers.length === 0 || isGenerating
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'
                                }`}
                        >
                            {isGenerating ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <Printer className="w-5 h-5" />
                            )}
                            <span>In {selectedUsers.length} thẻ</span>
                        </button>
                    </div>
                </div>

                {/* Progress Bar */}
                {progress && (
                    <div className="mt-3">
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Đang tạo trang {progress.current}/{progress.total}...</p>
                    </div>
                )}
            </div>

            {/* User Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {cardType === 'event' && !selectedEventId ? (
                    <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100">
                        <Calendar className="w-12 h-12 mx-auto mb-4 text-amber-300" />
                        <p className="text-slate-500 font-medium">Vui lòng chọn sự kiện ở trên</p>
                    </div>
                ) : cardType === 'event' && isLoadingParticipants ? (
                    <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 text-amber-400 animate-spin" />
                        <p className="text-slate-500">Đang tải danh sách người tham gia...</p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100">
                        <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                        <p className="text-slate-500">
                            {searchQuery ? 'Không tìm thấy kết quả' : cardType === 'event' ? 'Sự kiện chưa có người tham gia' : `Chưa có ${cardType === 'teacher' ? 'giáo viên' : 'học sinh'} nào`}
                        </p>
                    </div>
                ) : (
                    paginatedUsers.map(user => {
                        const isSelected = selectedUsers.includes(user.id);
                        const accentColor = cardType === 'event' ? 'amber' : (cardType === 'teacher' ? 'emerald' : 'indigo');
                        const bgSelected = cardType === 'event' ? 'bg-amber-600' : (cardType === 'teacher' ? 'bg-emerald-600' : 'bg-indigo-600');
                        const bgIcon = cardType === 'event' ? 'bg-amber-50' : (cardType === 'teacher' ? 'bg-emerald-50' : 'bg-indigo-50');
                        const iconColor = cardType === 'event' ? 'text-amber-600' : (cardType === 'teacher' ? 'text-emerald-600' : 'text-indigo-600');

                        return (
                            <div
                                key={user.id}
                                onClick={() => handleSelectUser(user.id)}
                                className={`p-4 rounded-2xl cursor-pointer transition-all ${isSelected
                                    ? `${bgSelected} text-white shadow-lg scale-[1.02]`
                                    : 'bg-white text-slate-700 border border-slate-100 hover:shadow-md'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center ${isSelected ? 'bg-white/20' : bgIcon}`}>
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                        ) : isSelected ? (
                                            <Check className="w-6 h-6 text-white" />
                                        ) : (
                                            <UserIcon className={`w-6 h-6 ${iconColor}`} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold truncate">{user.full_name}</p>
                                        <p className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                                            {user.organization || user.student_code || (
                                                cardType === 'event'
                                                    ? ((user as any)._isExternal ? guestLabel : (user.role === 'student' ? 'Học sinh' : user.role === 'teacher' ? 'Giáo viên' : 'Khách'))
                                                    : user.role
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap justify-between items-center gap-4">
                    <div className="text-sm text-slate-500 font-medium">
                        Hiển thị <span className="text-slate-900 font-bold">{(currentPage - 1) * usersPerPage + 1}-{Math.min(currentPage * usersPerPage, filteredUsers.length)}</span> trong tổng số <span className="text-indigo-600 font-black">{filteredUsers.length}</span> người
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => { setCurrentPage(prev => Math.max(1, prev - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className={`px-4 py-2 rounded-xl border font-bold transition-all flex items-center gap-2 ${currentPage === 1 ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            <ChevronLeft className="w-4 h-4" /> Trước
                        </button>
                        <div className="flex items-center px-4 py-2 bg-indigo-50 rounded-xl text-indigo-600 font-black text-sm border border-indigo-100">
                            Trang {currentPage} / {totalPages}
                        </div>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => { setCurrentPage(prev => Math.min(totalPages, prev + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className={`px-4 py-2 rounded-xl border font-bold transition-all flex items-center gap-2 ${currentPage === totalPages ? 'text-slate-300 border-slate-100 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            Tiếp <ChevronLeft className="w-4 h-4 rotate-180" />
                        </button>
                    </div>
                </div>
            )}

            {/* Live Card Preview */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-indigo-600" />
                    Xem trước thẻ
                    {selectedUsers.length > 0 && (
                        <span className="text-xs text-slate-400 font-medium ml-2">
                            (Đang hiển thị: {users.find(u => u.id === selectedUsers[0])?.full_name || 'Mẫu'})
                        </span>
                    )}
                </h3>
                <div className="flex justify-center">
                    <div
                        className="transform scale-100 hover:scale-105 transition-transform duration-300"
                        dangerouslySetInnerHTML={{ __html: getPreviewHTML() }}
                    />
                </div>
            </div>
        </div>
    );
};

export default CardGenerator;

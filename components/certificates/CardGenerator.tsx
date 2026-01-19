import React, { useState, useEffect, useRef } from 'react';
import { pdfService } from '../../services/pdfService';
import { qrService } from '../../services/qrService';
import { dataService } from '../../services/dataService';
import { User, Event } from '../../types';
import {
    CreditCard, GraduationCap, Calendar, Users, Check, X,
    Download, Printer, ChevronLeft, Search, CheckSquare, Square,
    User as UserIcon, QrCode, School
} from 'lucide-react';

interface CardGeneratorProps {
    users?: User[];
    event?: Event;
    onBack?: () => void;
}

const CardGenerator: React.FC<CardGeneratorProps> = ({ users: propUsers, event, onBack }) => {
    const [users, setUsers] = useState<User[]>(propUsers || []);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [cardType, setCardType] = useState<'event' | 'student' | 'teacher'>('student');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(!propUsers);

    useEffect(() => {
        if (!propUsers) {
            loadUsers();
        }
    }, [propUsers]);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const res = await dataService.getUsers();
            if (res.success && res.data) {
                setUsers(res.data);
            }
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter users based on card type and search
    const filteredUsers = users.filter(u => {
        const matchesType = cardType === 'teacher'
            ? u.role === 'teacher'
            : (cardType === 'student' ? u.role === 'student' : true);
        const matchesSearch = searchQuery === '' ||
            u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.student_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.organization || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

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

    const handleGenerate = async () => {
        if (selectedUsers.length === 0) return;

        setIsGenerating(true);
        try {
            // Generate all card HTMLs first
            const cardHTMLs: string[] = [];

            for (const userId of selectedUsers) {
                const user = users.find(u => u.id === userId);
                if (!user) continue;

                const qrData = await qrService.generateUserQR(user.student_code || user.id);

                let cardTitle = 'Thẻ Học Sinh';
                if (cardType === 'teacher') cardTitle = 'Thẻ Giáo Viên';
                else if (cardType === 'event') cardTitle = event?.name || 'Thẻ Sự Kiện';

                const html = pdfService.generateCardHTML({
                    fullName: user.full_name,
                    role: user.role,
                    code: user.student_code || user.id,
                    className: user.organization || user.class_id,
                    avatarUrl: user.avatar_url,
                    qrCode: qrData,
                    eventName: cardTitle,
                    birthDate: user.birth_date
                });

                cardHTMLs.push(html);
            }

            // Print ALL cards in one window
            if (cardHTMLs.length > 0) {
                pdfService.printBatchCards(cardHTMLs);
            }
        } catch (error) {
            console.error('Failed to generate cards:', error);
        } finally {
            setIsGenerating(false);
        }
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
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 flex items-center gap-2">
                            <ChevronLeft className="w-4 h-4" /> Quay lại
                        </button>
                    )}
                </div>
            </div>

            {/* Card Type Selector */}
            <div className="grid grid-cols-3 gap-4">
                <button
                    onClick={() => { setCardType('student'); setSelectedUsers([]); }}
                    className={`p-5 rounded-2xl text-center transition-all flex flex-col items-center gap-3 ${cardType === 'student'
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${cardType === 'student' ? 'bg-white/20' : 'bg-indigo-50'
                        }`}>
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
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${cardType === 'teacher' ? 'bg-white/20' : 'bg-emerald-50'
                        }`}>
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
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${cardType === 'event' ? 'bg-white/20' : 'bg-amber-50'
                        }`}>
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

            {/* Search & Selection Controls */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex flex-wrap gap-4 items-center">
                    {/* Search */}
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

                    {/* Select All Toggle */}
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

                    {/* Selection count */}
                    <span className="text-slate-500">
                        Đã chọn: <strong className="text-indigo-600">{selectedUsers.length}</strong> / {filteredUsers.length}
                    </span>

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={selectedUsers.length === 0 || isGenerating}
                        className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 ${selectedUsers.length === 0 || isGenerating
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'
                            }`}
                    >
                        {isGenerating ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Đang tạo...
                            </>
                        ) : (
                            <>
                                <Printer className="w-5 h-5" />
                                Tạo {selectedUsers.length} thẻ
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* User Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredUsers.length === 0 ? (
                    <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100">
                        <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                        <p className="text-slate-500">
                            {searchQuery ? 'Không tìm thấy kết quả' : `Chưa có ${cardType === 'teacher' ? 'giáo viên' : 'học sinh'} nào`}
                        </p>
                    </div>
                ) : (
                    filteredUsers.map(user => (
                        <div
                            key={user.id}
                            onClick={() => handleSelectUser(user.id)}
                            className={`p-4 rounded-2xl cursor-pointer transition-all ${selectedUsers.includes(user.id)
                                ? 'bg-indigo-600 text-white shadow-lg scale-[1.02]'
                                : 'bg-white text-slate-700 border border-slate-100 hover:shadow-md'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                {/* Avatar or Placeholder */}
                                <div className={`w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center ${selectedUsers.includes(user.id) ? 'bg-white/20' : 'bg-indigo-50'
                                    }`}>
                                    {user.avatar_url ? (
                                        <img
                                            src={user.avatar_url}
                                            alt={user.full_name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : selectedUsers.includes(user.id) ? (
                                        <Check className="w-6 h-6 text-white" />
                                    ) : (
                                        <UserIcon className={`w-6 h-6 ${user.role === 'teacher' ? 'text-emerald-600' : 'text-indigo-600'
                                            }`} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold truncate">{user.full_name}</p>
                                    <p className={`text-xs truncate ${selectedUsers.includes(user.id) ? 'text-white/70' : 'text-slate-400'}`}>
                                        {user.organization || user.student_code || user.role}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Card Preview */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-indigo-600" />
                    Xem trước thẻ
                </h3>
                <div className="flex justify-center">
                    <div className={`w-80 h-52 rounded-2xl p-5 text-white flex flex-col justify-between shadow-xl relative overflow-hidden ${cardType === 'teacher'
                        ? 'bg-gradient-to-br from-emerald-600 to-teal-600'
                        : cardType === 'event'
                            ? 'bg-gradient-to-br from-amber-600 to-orange-600'
                            : 'bg-gradient-to-br from-indigo-600 to-purple-600'
                        }`}>
                        {/* Decorative circle */}
                        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full"></div>

                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="text-xs opacity-70 tracking-widest uppercase">EduCheck</p>
                                <p className="font-bold text-sm">
                                    {cardType === 'teacher' ? 'THẺ GIÁO VIÊN' : cardType === 'event' ? 'THẺ SỰ KIỆN' : 'THẺ HỌC SINH'}
                                </p>
                            </div>
                            {/* QR placeholder */}
                            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center">
                                <QrCode className="w-10 h-10 text-slate-600" />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10">
                            {/* Avatar placeholder */}
                            <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center border-2 border-white/30">
                                {cardType === 'teacher' ? (
                                    <School className="w-8 h-8 text-white/80" />
                                ) : (
                                    <GraduationCap className="w-8 h-8 text-white/80" />
                                )}
                            </div>
                            <div>
                                <p className="font-bold text-lg">Nguyễn Văn A</p>
                                <p className="text-sm opacity-80">
                                    {cardType === 'teacher' ? 'Giáo viên • Toán' : 'Lớp 12A1 • HS123456'}
                                </p>
                            </div>
                        </div>

                        <div className="absolute bottom-3 left-5 right-5 flex justify-between items-center text-xs opacity-60 z-10">
                            <span className="bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider">
                                {cardType === 'teacher' ? 'Teacher' : cardType === 'event' ? 'Event' : 'Student'}
                            </span>
                            <span>Powered by AI</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CardGenerator;

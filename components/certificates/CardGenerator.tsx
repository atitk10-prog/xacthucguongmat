import React, { useState, useRef } from 'react';
import { pdfService } from '../../services/pdfService';
import { qrService } from '../../services/qrService';
import { User, Event } from '../../types';

interface CardGeneratorProps {
    users?: User[];
    event?: Event;
    onBack?: () => void;
}

const CardGenerator: React.FC<CardGeneratorProps> = ({ users = [], event, onBack }) => {
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [cardType, setCardType] = useState<'event' | 'student'>('student');

    const handleSelectAll = () => {
        if (selectedUsers.length === users.length) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(users.map(u => u.id));
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
            for (const userId of selectedUsers) {
                const user = users.find(u => u.id === userId);
                if (!user) continue;

                const qrData = qrService.generateUserQR(user);

                await pdfService.generateParticipantCard({
                    userName: user.full_name,
                    eventName: event?.name || 'Thẻ Học Sinh',
                    qrCode: qrData,
                    userId: user.id,
                    classId: user.class_id,
                    date: new Date().toISOString()
                });

                // Small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error('Failed to generate cards:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">🎫 Tạo thẻ tham gia</h2>
                    <p className="text-slate-500 font-medium mt-1">Tạo thẻ QR cho học sinh tham gia sự kiện</p>
                </div>
                <div className="flex gap-2">
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                            ← Quay lại
                        </button>
                    )}
                </div>
            </div>

            {/* Card Type Selector */}
            <div className="flex gap-4">
                <button
                    onClick={() => setCardType('student')}
                    className={`flex-1 p-6 rounded-2xl text-center transition-all ${cardType === 'student'
                            ? 'bg-indigo-600 text-white shadow-lg'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <span className="text-4xl">🎓</span>
                    <p className="font-bold mt-2">Thẻ Học sinh</p>
                    <p className="text-sm opacity-70 mt-1">Thẻ QR cá nhân để check-in</p>
                </button>

                <button
                    onClick={() => setCardType('event')}
                    className={`flex-1 p-6 rounded-2xl text-center transition-all ${cardType === 'event'
                            ? 'bg-indigo-600 text-white shadow-lg'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <span className="text-4xl">📅</span>
                    <p className="font-bold mt-2">Thẻ Sự kiện</p>
                    <p className="text-sm opacity-70 mt-1">Thẻ tham gia sự kiện cụ thể</p>
                </button>
            </div>

            {/* Selection Controls */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSelectAll}
                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
                        >
                            {selectedUsers.length === users.length ? '✗ Bỏ chọn tất cả' : '✓ Chọn tất cả'}
                        </button>
                        <span className="text-slate-500">
                            Đã chọn: <strong className="text-indigo-600">{selectedUsers.length}</strong> / {users.length}
                        </span>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={selectedUsers.length === 0 || isGenerating}
                        className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 ${selectedUsers.length === 0 || isGenerating
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                    >
                        {isGenerating ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Đang tạo...
                            </>
                        ) : (
                            <>
                                📥 Tạo {selectedUsers.length} thẻ
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* User Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {users.length === 0 ? (
                    <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100">
                        <span className="text-5xl">👥</span>
                        <p className="mt-4 text-slate-500">Chưa có học sinh nào</p>
                        <p className="text-sm text-slate-400">Thêm học sinh trong phần Quản lý người dùng</p>
                    </div>
                ) : (
                    users.map(user => (
                        <div
                            key={user.id}
                            onClick={() => handleSelectUser(user.id)}
                            className={`p-4 rounded-2xl cursor-pointer transition-all ${selectedUsers.includes(user.id)
                                    ? 'bg-indigo-600 text-white shadow-lg scale-[1.02]'
                                    : 'bg-white text-slate-700 border border-slate-100 hover:shadow-md'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${selectedUsers.includes(user.id) ? 'bg-white/20' : 'bg-indigo-50'
                                    }`}>
                                    {selectedUsers.includes(user.id) ? '✓' : '👤'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold truncate">{user.full_name}</p>
                                    <p className={`text-xs ${selectedUsers.includes(user.id) ? 'text-white/70' : 'text-slate-400'}`}>
                                        {user.class_id || user.role}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Card Preview */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-900 mb-4">Xem trước thẻ</h3>
                <div className="flex justify-center">
                    <div className="w-80 h-48 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white flex flex-col justify-between shadow-xl">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs opacity-70">EduCheck</p>
                                <p className="font-black text-lg">{cardType === 'event' ? 'THẺ SỰ KIỆN' : 'THẺ HỌC SINH'}</p>
                            </div>
                            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center">
                                <span className="text-3xl">📷</span>
                            </div>
                        </div>
                        <div>
                            <p className="font-bold text-lg">Nguyễn Văn A</p>
                            <p className="text-sm opacity-70">Lớp 12A1 • {new Date().toLocaleDateString('vi-VN')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CardGenerator;

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, ZoomIn, CreditCard, RotateCw, MapPin, Calendar, Hash, Layers } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { User as UserIcon } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export default function DigitalCard() {
    const [user, setUser] = useState(dataService.getStoredUser());
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [isZoomed, setIsZoomed] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [roomName, setRoomName] = useState('');

    useEffect(() => {
        if (user?.student_code || user?.id) {
            const codeValue = user.student_code || user.id;
            QRCode.toDataURL(codeValue, {
                width: 400,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            })
                .then(url => setQrDataUrl(url))
                .catch(err => console.error('Error generating QR', err));
        }

        // Fetch room name
        const fetchRoom = async () => {
            if (user?.room_id) {
                const { data } = await supabase.from('rooms').select('name').eq('id', user.room_id).single();
                if (data) setRoomName(data.name);
            }
        };
        fetchRoom();
    }, [user]);

    if (!user) return <div className="p-4 text-center">Vui lòng đăng nhập lại.</div>;

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 perspective-1000">
            <h2 className="text-2xl font-bold text-gray-800">Thẻ Kiểm Soát Ra Vào</h2>

            {/* FLIP CONTAINER */}
            <div
                className={`relative w-full max-w-sm aspect-[1.586/1] duration-500 preserve-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
            >
                {/* FRONT SIDE */}
                <div className="absolute inset-0 backface-hidden rounded-2xl shadow-2xl overflow-hidden">
                    {/* Background & Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-blue-800 to-blue-900 text-white p-6 flex flex-col justify-between">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                        {/* Front Header */}
                        <div className="flex justify-between items-start z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-md border border-white/30">
                                    <div className="font-bold text-lg tracking-tighter">EC</div>
                                </div>
                                <div>
                                    <h3 className="text-[10px] opacity-80 font-medium tracking-wider uppercase">Thẻ Học Sinh</h3>
                                    <h1 className="text-lg font-bold">EduCheck</h1>
                                </div>
                            </div>
                            <CreditCard className="text-white/50" size={24} />
                        </div>

                        {/* Front Main Content */}
                        <div className="flex gap-4 items-center mt-2 z-10">
                            <div className="w-20 h-24 bg-white/20 rounded-xl border border-white/30 overflow-hidden shadow-inner flex-shrink-0">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center"><UserIcon className="text-white/50" /></div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                                <h2 className="text-xl font-bold truncate leading-tight">{user.full_name}</h2>
                                <p className="text-blue-200 text-sm font-medium">{user.student_code}</p>
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm border border-white/10 mt-1">
                                    <Layers size={12} className="text-blue-200" />
                                    <span className="text-xs font-semibold">{user.organization || 'K10 - A1'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Front Footer */}
                        <div className="flex justify-between items-end z-10">
                            <div className="text-[10px] text-blue-200/80">
                                <span>Giá trị đến: </span>
                                <span className="font-bold text-white">05/2026</span>
                            </div>
                            <div
                                className="bg-white p-1 rounded-lg shadow-lg cursor-zoom-in active:scale-95 transition-transform"
                                onClick={(e) => { e.stopPropagation(); setIsZoomed(true); }}
                            >
                                <img src={qrDataUrl} className="w-12 h-12" alt="QR" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* BACK SIDE */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl shadow-2xl overflow-hidden bg-white border border-gray-200 p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-gray-800 uppercase tracking-wider text-xs border-b border-gray-200 pb-1 flex-1">Thông tin chi tiết</h3>
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                <img src={qrDataUrl} className="w-6 h-6 opacity-50" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                            <div className="col-span-2">
                                <span className="text-gray-400 text-xs block">Họ và tên</span>
                                <span className="font-bold text-gray-800">{user.full_name}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 text-xs flex items-center gap-1"><Calendar size={10} /> Ngày sinh</span>
                                <span className="font-medium text-gray-700">{user.birth_date ? new Date(user.birth_date).toLocaleDateString('vi-VN') : '---'}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 text-xs flex items-center gap-1"><Hash size={10} /> Email</span>
                                <span className="font-mono text-gray-600 text-xs break-all line-clamp-1">{user.email || user.id.slice(0, 8)}</span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-gray-400 text-xs flex items-center gap-1"><MapPin size={10} /> Địa chỉ nội trú</span>
                                <span className="font-medium text-gray-700">
                                    {roomName ? `${user.zone} - ${roomName}` : (user.room_id ? 'Đang cập nhật...' : 'Chưa xếp phòng')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <p className="text-[10px] text-gray-400">
                            Tìm thấy thẻ vui lòng liên hệ văn phòng nhà trường.<br />
                            Hotline: (024) 1234 5678
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition-colors"
                >
                    <RotateCw size={18} />
                    Lật mặt thẻ
                </button>
                <button
                    onClick={() => setIsZoomed(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:-translate-y-0.5"
                >
                    <ZoomIn size={18} />
                    Mã QR Lớn
                </button>
            </div>


            {/* ZOOM MODAL */}
            {isZoomed && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200"
                    onClick={() => setIsZoomed(false)}
                >
                    <div
                        className="bg-white p-8 rounded-[2rem] flex flex-col items-center space-y-6 max-w-sm w-full animate-in zoom-in-95 duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center space-y-1">
                            <h3 className="text-2xl font-black text-gray-900">{user.full_name}</h3>
                            <p className="text-gray-500 text-lg font-medium">{user.organization}</p>
                        </div>

                        <div className="p-4 border-[6px] border-gray-900 rounded-3xl bg-white shadow-inner">
                            {qrDataUrl && (
                                <img src={qrDataUrl} alt="Full QR" className="w-64 h-64 object-contain rendering-pixelated" />
                            )}
                        </div>

                        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-bold">
                            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                            Sẵn sàng quét
                        </div>

                        <button
                            onClick={() => setIsZoomed(false)}
                            className="w-full py-3.5 bg-gray-100 font-bold text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                .perspective-1000 { perspective: 1000px; }
                .rotate-y-180 { transform: rotateY(180deg); }
                .preserve-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
            `}</style>
        </div>
    );
}




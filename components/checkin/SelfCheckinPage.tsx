import React, { useState, useRef, useEffect, useCallback } from 'react';
import { dataService } from '../../services/dataService';
import { faceService, stringToDescriptor, compareFaces } from '../../services/faceService';
import { soundService } from '../../services/soundService';
import { Event, User } from '../../types';
import { Icons } from '../ui';

interface SelfCheckinPageProps {
    eventId: string;
    currentUser: User | null;
    onLoginNeeded: () => void;
    onSuccess: () => void;
    onBack?: () => void;
}

const SelfCheckinPage: React.FC<SelfCheckinPageProps> = ({ eventId, currentUser, onLoginNeeded, onSuccess, onBack }) => {
    const [event, setEvent] = useState<Event | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [status, setStatus] = useState<'idle' | 'checking' | 'verifying_location' | 'verifying_face' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [distance, setDistance] = useState<number | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [modelsReady, setModelsReady] = useState(false);
    const [faceConfidence, setFaceConfidence] = useState<number | null>(null);
    const [isLowLight, setIsLowLight] = useState(false);

    // 1. Load Event Data
    useEffect(() => {
        const loadEvent = async () => {
            setIsLoading(true);
            try {
                const res = await dataService.getEvent(eventId);
                if (res.success && res.data) {
                    setEvent(res.data);
                } else {
                    setErrorMessage('Không tìm thấy sự kiện hoặc sự kiện đã kết thúc.');
                    setStatus('error');
                }
            } catch (err) {
                setErrorMessage('Lỗi kết nối khi tải thông tin sự kiện.');
                setStatus('error');
            } finally {
                setIsLoading(false);
            }
        };
        loadEvent();
    }, [eventId]);

    // 2. Load Face Models
    useEffect(() => {
        faceService.loadModels().then(() => setModelsReady(true));
    }, []);

    // 3. Check Authentication
    useEffect(() => {
        if (!isLoading && !currentUser) {
            onLoginNeeded();
        }
    }, [isLoading, currentUser, onLoginNeeded]);

    // Cleanup camera
    useEffect(() => {
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [stream]);

    // Distance calculation (Haversine)
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371e3; // metres
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const startCheckin = async () => {
        if (!event || !currentUser) return;

        setStatus('verifying_location');
        setErrorMessage(null);

        // A. Verify GPS
        if (event.latitude && event.longitude) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    });
                });

                const curLat = pos.coords.latitude;
                const curLng = pos.coords.longitude;
                setLocation({ lat: curLat, lng: curLng });

                const dist = calculateDistance(curLat, curLng, event.latitude, event.longitude);
                setDistance(dist);

                const radius = event.radius_meters || 100;
                if (dist > radius) {
                    setErrorMessage(`Bạn đang ở quá xa vị trí sự kiện (${Math.round(dist)}m). Vui lòng di chuyển đến gần hơn (trong bán kính ${radius}m).`);
                    setStatus('error');
                    soundService.play('error');
                    return;
                }
            } catch (err) {
                setErrorMessage('Vui lòng bật định vị GPS để tiếp tục điểm danh.');
                setStatus('error');
                soundService.play('error');
                return;
            }
        }

        // B. Setup Camera for Face ID
        setStatus('verifying_face');
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 }
            });
            setStream(mediaStream);
            if (videoRef.current) videoRef.current.srcObject = mediaStream;

            // Wait for video to be ready
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Perform Face Recognition
            if (videoRef.current && currentUser.face_descriptor) {
                const descriptor = await faceService.getFaceDescriptor(videoRef.current);
                if (descriptor) {
                    const savedDescriptor = stringToDescriptor(currentUser.face_descriptor);
                    const confidence = compareFaces(descriptor, savedDescriptor);
                    setFaceConfidence(confidence);

                    const threshold = event.face_threshold || 45;
                    if (confidence < threshold) {
                        setErrorMessage(`Nhận diện không chính xác (${confidence}%). Vui lòng thử lại ở nơi có đủ ánh sáng.`);
                        setStatus('error');
                        soundService.play('error');
                        return;
                    }

                    // C. Submit Check-in
                    // First, find the corresponding participant record to get the participant_id
                    const { data: participants } = await dataService.getEventParticipants(event.id);
                    const participant = participants?.find(p => p.user_id === currentUser.id);

                    const result = await dataService.checkin({
                        event_id: event.id,
                        user_id: currentUser.id,
                        participant_id: participant?.id, // Link to event_participants
                        face_confidence: confidence,
                        face_verified: true,
                        checkin_mode: 'student',
                        device_info: navigator.userAgent
                    });

                    if (result.success) {
                        setStatus('success');
                        soundService.play('success');
                        setTimeout(() => onSuccess(), 3000);
                    } else {
                        setErrorMessage(result.error || 'Lỗi trong quá trình điểm danh.');
                        setStatus('error');
                        soundService.play('error');
                    }
                } else {
                    setErrorMessage('Không nhận diện được khuôn mặt. Hãy nhìn thẳng vào camera.');
                    setStatus('error');
                    soundService.play('error');
                }
            } else if (!currentUser.face_descriptor) {
                setErrorMessage('Bạn chưa đăng ký Face ID. Vui lòng liên hệ quản trị viên.');
                setStatus('error');
            }
        } catch (err) {
            setErrorMessage('Không thể truy cập camera. Vui lòng cấp quyền truy cập.');
            setStatus('error');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-bold text-slate-600">Đang tải thông tin sự kiện...</p>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6 scale-up">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                </div>
                <h1 className="text-3xl font-black text-emerald-900 mb-2">ĐIỂM DANH THÀNH CÔNG!</h1>
                <p className="text-emerald-700 font-bold text-lg mb-8">{event?.name}</p>
                <div className="bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-emerald-200">
                    <p className="text-emerald-800 text-sm">Cảm ơn {currentUser?.full_name}. Hệ thống đã ghi nhận sự hiện diện của bạn.</p>
                </div>
                <p className="text-emerald-500 text-xs mt-12">Đang chuyển hướng về trang chủ...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col max-w-lg mx-auto overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-slate-600">
                    <Icons.ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-lg font-black text-slate-800">Tự điểm danh</h1>
                <div className="w-10"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Event Summary */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    <div className="relative z-10">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 inline-block">SỰ KIỆN ĐANG DIỄN RA</span>
                        <h2 className="text-2xl font-black text-slate-900 mb-4">{event?.name}</h2>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                                <Icons.Location className="w-4 h-4 text-indigo-500" />
                                <span>{event?.location}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                                <Icons.Clock className="w-4 h-4 text-indigo-500" />
                                <span>{new Date(event?.start_time!).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(event?.end_time!).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status / Instructions */}
                {status === 'idle' && (
                    <div className="text-center space-y-6 py-8">
                        <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto text-indigo-600 mb-4 animate-bounce">
                            <Icons.Fingerprint className="w-10 h-10" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 mb-2">Sẵn sàng điểm danh?</h3>
                            <p className="text-slate-500 text-sm leading-relaxed px-4">
                                Vui lòng cho phép truy cập GPS và Camera để xác thực vị trí và danh tính của bạn.
                            </p>
                        </div>
                        <div className="flex flex-col gap-4">
                            <label className="flex items-center justify-center gap-2 text-slate-500 text-sm cursor-pointer hover:text-indigo-600 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isLowLight}
                                    onChange={(e) => setIsLowLight(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="font-bold">Chế độ bù sáng ban đêm 🌙</span>
                            </label>

                            <button
                                onClick={startCheckin}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
                            >
                                BẮT ĐẦU NGAY
                            </button>
                        </div>
                    </div>
                )}

                {/* Verifying View */}
                {(status === 'verifying_location' || status === 'verifying_face' || (status === 'error' && stream)) && (
                    <div className="space-y-6">
                        {/* Camera Preview */}
                        <div className="relative aspect-square md:aspect-video rounded-[2.5rem] overflow-hidden bg-slate-200 border-4 border-white shadow-xl">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover mirror"
                            />

                            {/* Low Light Flash Overlay */}
                            {isLowLight && (
                                <div className="absolute inset-0 bg-white z-[5] animate-pulse pointer-events-none opacity-50 shadow-[inset_0_0_100px_rgba(255,255,255,1)]" />
                            )}

                            {/* Overlay Scanning Effect */}
                            {status === 'verifying_face' && (
                                <div className="absolute inset-0 z-10">
                                    <div className="w-full h-1 bg-indigo-400/50 absolute top-0 shadow-[0_0_15px_rgba(79,70,229,0.5)] animate-scan"></div>
                                    <div className="absolute inset-0 bg-indigo-900/10 pointer-events-none"></div>
                                </div>
                            )}

                            {/* Corner Borders */}
                            <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl"></div>
                            <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl"></div>
                            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl"></div>
                            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl"></div>
                        </div>

                        {/* Progress Indicator */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${status === 'error' ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                                {status === 'verifying_location' && <Icons.Location className="w-6 h-6 animate-pulse" />}
                                {status === 'verifying_face' && <Icons.User className="w-6 h-6 animate-pulse" />}
                                {status === 'error' && <Icons.AlertCircle className="w-6 h-6" />}
                            </div>
                            <div className="flex-1">
                                <p className="font-black text-slate-800 text-sm uppercase">
                                    {status === 'verifying_location' ? 'Xác thực vị trí GPS...' :
                                        status === 'verifying_face' ? 'Xác thực khuôn mặt...' : 'Lỗi xác thực'}
                                </p>
                                <p className="text-xs text-slate-500 font-medium">
                                    {status === 'verifying_location' ? 'Hệ thống đang kiểm tra tọa độ hiện tại' :
                                        status === 'verifying_face' ? 'Vui lòng nhìn thẳng vào camera' : errorMessage}
                                </p>
                            </div>
                        </div>

                        {status === 'error' && (
                            <button
                                onClick={startCheckin}
                                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-slate-800"
                            >
                                THỬ LẠI
                            </button>
                        )}
                    </div>
                )}

                {/* Error State (No Cam) */}
                {status === 'error' && !stream && (
                    <div className="bg-red-50 rounded-3xl p-8 text-center space-y-4 border border-red-100">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Icons.AlertCircle className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-black text-red-900">Không thể điểm danh</h3>
                        <p className="text-red-700/80 text-sm font-medium leading-relaxed">
                            {errorMessage}
                        </p>
                        <button
                            onClick={startCheckin}
                            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
                        >
                            THỬ LẠI
                        </button>
                    </div>
                )}
            </div>

            {/* Footer / User Info */}
            <div className="bg-white p-6 border-t border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden shadow-inner flex-shrink-0">
                    {currentUser?.avatar_url ? (
                        <img src={currentUser.avatar_url} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 font-black">
                            {currentUser?.full_name.charAt(0)}
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Đang đăng nhập</p>
                    <p className="text-slate-900 font-black">{currentUser?.full_name}</p>
                </div>
            </div>

            <style>{`
                .mirror { transform: scaleX(-1); }
                .animate-scan {
                    animation: scan 2s linear infinite;
                }
                @keyframes scan {
                    0% { top: 0; }
                    100% { top: 100%; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.5s ease-out;
                }
                .scale-up {
                    animation: scaleUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleUp {
                    from { transform: scale(0.5); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default SelfCheckinPage;

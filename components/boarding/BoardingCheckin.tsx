import React, { useState, useRef, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { faceService } from '../../services/faceService';
import { User, BoardingCheckin as BoardingCheckinType } from '../../types';

type CheckinType = 'morning_in' | 'morning_out' | 'evening_in' | 'evening_out';

interface BoardingCheckinProps {
    currentUser?: User;
    onBack?: () => void;
}

const BoardingCheckin: React.FC<BoardingCheckinProps> = ({ currentUser, onBack }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedType, setSelectedType] = useState<CheckinType>('morning_in');
    const [faceDetected, setFaceDetected] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; data?: BoardingCheckinType } | null>(null);
    const [todayRecord, setTodayRecord] = useState<BoardingCheckinType | null>(null);

    // Determine current time period
    const getCurrentPeriod = (): CheckinType => {
        const hour = new Date().getHours();
        if (hour < 7) return 'morning_in';
        if (hour < 12) return 'morning_out';
        if (hour < 18) return 'evening_in';
        return 'evening_out';
    };

    useEffect(() => {
        setSelectedType(getCurrentPeriod());
    }, []);

    // Load face models
    useEffect(() => {
        const loadModels = async () => {
            try {
                await faceService.loadModels();
                setModelsReady(true);
            } catch (err) {
                console.error('Failed to load face models:', err);
            }
        };
        loadModels();
    }, []);

    // Start camera
    useEffect(() => {
        const startCamera = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                setStream(mediaStream);
                if (videoRef.current) videoRef.current.srcObject = mediaStream;
            } catch (err) {
                console.error('Camera error:', err);
            }
        };
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, []);

    // Real-time face detection
    useEffect(() => {
        if (!modelsReady || !videoRef.current) return;

        const detectLoop = async () => {
            if (!videoRef.current || videoRef.current.readyState !== 4) {
                requestAnimationFrame(detectLoop);
                return;
            }

            try {
                const detections = await faceService.detectFaces(videoRef.current);
                setFaceDetected(detections.length > 0);
            } catch (err) {
                console.error('Face detection error:', err);
            }

            setTimeout(() => requestAnimationFrame(detectLoop), 300);
        };

        detectLoop();
    }, [modelsReady]);

    const handleCheckin = async () => {
        if (!currentUser || isProcessing) return;
        setIsProcessing(true);
        setResult(null);

        try {
            // Verify face is detected
            if (!faceDetected) {
                setResult({ success: false, message: 'Không phát hiện khuôn mặt!' });
                setIsProcessing(false);
                return;
            }

            const response = await dataService.boardingCheckin(currentUser.id, selectedType);

            if (response.success && response.data) {
                setResult({
                    success: true,
                    message: `Check-in ${getTypeLabel(selectedType)} thành công!`,
                    data: response.data
                });
                setTodayRecord(response.data);
            } else {
                setResult({ success: false, message: response.error || 'Check-in thất bại' });
            }
        } catch (error) {
            console.error('Boarding check-in error:', error);
            setResult({ success: false, message: 'Có lỗi xảy ra' });
        } finally {
            setIsProcessing(false);
        }
    };

    const getTypeLabel = (type: CheckinType): string => {
        const labels: Record<CheckinType, string> = {
            'morning_in': 'Vào buổi sáng',
            'morning_out': 'Ra buổi sáng',
            'evening_in': 'Vào buổi tối',
            'evening_out': 'Ra buổi tối'
        };
        return labels[type];
    };

    const TypeIconSVGs = {
        morning_in: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
        ),
        morning_out: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
        ),
        evening_in: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
        ),
        evening_out: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
        )
    };

    const getTypeIcon = (type: CheckinType): React.ReactNode => TypeIconSVGs[type];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-center">
                {onBack && (
                    <button onClick={onBack} className="px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl font-bold text-sm hover:bg-white/20">
                        ← Quay lại
                    </button>
                )}
                <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                    </svg>
                    <p className="text-white text-sm font-bold">Check-in Nội trú</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-col lg:flex-row h-screen p-4 pt-20 gap-6">
                {/* Camera View */}
                <div className="flex-1 relative rounded-3xl overflow-hidden bg-black/30">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />

                    {/* Face Detection Frame */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className={`w-64 h-72 border-2 transition-all ${faceDetected ? 'border-emerald-500' : 'border-white/30'} rounded-3xl`}>
                            <div className={`absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 ${faceDetected ? 'border-emerald-500' : 'border-indigo-500'} rounded-tl-2xl`}></div>
                            <div className={`absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 ${faceDetected ? 'border-emerald-500' : 'border-indigo-500'} rounded-tr-2xl`}></div>
                            <div className={`absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 ${faceDetected ? 'border-emerald-500' : 'border-indigo-500'} rounded-bl-2xl`}></div>
                            <div className={`absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 ${faceDetected ? 'border-emerald-500' : 'border-indigo-500'} rounded-br-2xl`}></div>
                        </div>
                    </div>

                    {/* Face Status */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2">
                        <div className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 ${faceDetected ? 'bg-emerald-500/80 text-white' : 'bg-orange-500/80 text-white'}`}>
                            {faceDetected ? (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Đã nhận diện khuôn mặt</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg> Đưa khuôn mặt vào khung</>
                            )}
                        </div>
                    </div>
                </div>

                {/* Control Panel */}
                <div className="w-full lg:w-96 bg-white/10 backdrop-blur-xl rounded-3xl p-6 flex flex-col">
                    {/* User Info */}
                    {currentUser && (
                        <div className="bg-white/10 rounded-2xl p-4 mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                                    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-white font-bold">{currentUser.full_name}</p>
                                    <p className="text-indigo-200 text-sm">Phòng: {currentUser.room_id || 'Chưa xác định'}</p>
                                    <p className="text-indigo-200 text-sm">Khu: {currentUser.zone || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Check-in Type Selection */}
                    <div className="mb-6">
                        <p className="text-white/60 text-xs uppercase font-bold mb-3">Loại check-in</p>
                        <div className="grid grid-cols-2 gap-3">
                            {(['morning_in', 'morning_out', 'evening_in', 'evening_out'] as CheckinType[]).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setSelectedType(type)}
                                    className={`p-4 rounded-2xl text-left transition-all ${selectedType === type
                                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                                        }`}
                                >
                                    <span className="text-2xl">{getTypeIcon(type)}</span>
                                    <p className="text-xs font-bold mt-2">{getTypeLabel(type)}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Today's Record */}
                    {todayRecord && (
                        <div className="bg-emerald-500/20 rounded-2xl p-4 mb-6">
                            <p className="text-emerald-300 text-xs uppercase font-bold mb-2">Hôm nay</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="text-white/60">Sáng vào: <span className="text-white">{todayRecord.morning_in ? '✅' : '—'}</span></div>
                                <div className="text-white/60">Sáng ra: <span className="text-white">{todayRecord.morning_out ? '✅' : '—'}</span></div>
                                <div className="text-white/60">Tối vào: <span className="text-white">{todayRecord.evening_in ? '✅' : '—'}</span></div>
                                <div className="text-white/60">Tối ra: <span className="text-white">{todayRecord.evening_out ? '✅' : '—'}</span></div>
                            </div>
                        </div>
                    )}

                    {/* Check-in Button */}
                    <button
                        onClick={handleCheckin}
                        disabled={isProcessing || !faceDetected}
                        className={`w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all mt-auto ${isProcessing || !faceDetected
                            ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02]'
                            }`}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                                ĐANG XỬ LÝ...
                            </>
                        ) : (
                            <>
                                <span className="text-2xl">{getTypeIcon(selectedType)}</span>
                                CHECK-IN {getTypeLabel(selectedType).toUpperCase()}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Result Modal */}
            {result && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${result.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            {result.success ? (
                                <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            ) : (
                                <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            )}
                        </div>
                        <h2 className={`text-2xl font-black mb-2 ${result.success ? 'text-emerald-600' : 'text-red-600'}`}>
                            {result.success ? 'Thành công!' : 'Thất bại'}
                        </h2>
                        <p className="text-slate-500 mb-6">{result.message}</p>
                        <button
                            onClick={() => setResult(null)}
                            className={`w-full py-4 rounded-2xl font-black ${result.success ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                            ĐÓNG
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoardingCheckin;

import React, { useState, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { faceService } from '../../services/faceService';
import { soundService } from '../../services/soundService';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import { Camera, X, CheckCircle, RefreshCw, User as UserIcon, Mail, Loader2, AlertTriangle } from 'lucide-react';

interface FaceLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: (user: User) => void;
}

const FaceLoginModal: React.FC<FaceLoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const stableStartTimeRef = useRef<number | null>(null);
    const lastProcessedTimeRef = useRef<number>(0);
    const recognizedPersonRef = useRef<{ id: string; name: string; confidence: number } | null>(null);
    const isProcessingRef = useRef(false);

    // State
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [modelsReady, setModelsReady] = useState(false);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [faceDetected, setFaceDetected] = useState(false);
    const [detectedPerson, setDetectedPerson] = useState<{ name: string; confidence: number } | null>(null);
    const [guidance, setGuidance] = useState<string>('Đang khởi tạo...');
    const [stabilityProgress, setStabilityProgress] = useState(0);
    const [loginSuccess, setLoginSuccess] = useState(false);
    const [matchedUser, setMatchedUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [attempts, setAttempts] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [lockoutTime, setLockoutTime] = useState<number | null>(null);
    const [isLowLight, setIsLowLight] = useState(false);

    // Sync ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // Initialize everything when modal opens
    useEffect(() => {
        if (!isOpen) return;

        const init = async () => {
            try {
                setError(null);

                // 1. Start Camera IMMEDIATELY for fast UX
                setGuidance('Đang mở camera...');
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                setStream(newStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = newStream;
                }

                // 2. Load Face Models in background
                setGuidance('Đang khởi tạo AI...');
                await faceService.loadModels();
                setModelsReady(true);

                // 3. Load Users in background WITHOUT blocking
                setGuidance('Đưa khuôn mặt vào khung hình');
                dataService.getUsers({ status: 'active' }).then(response => {
                    if (response.success && response.data) {
                        faceService.faceMatcher.clearAll();
                        let count = 0;
                        for (const user of response.data) {
                            if (user.face_descriptor) {
                                try {
                                    const descriptor = faceService.stringToDescriptor(user.face_descriptor);
                                    if (descriptor.length > 0) {
                                        faceService.faceMatcher.registerFace(user.id, descriptor, user.full_name);
                                        count++;
                                    }
                                } catch (e) { }
                            }
                        }
                        setUsersLoaded(true);
                    } else {
                        console.error('Failed to load face data');
                    }
                });

            } catch (err) {
                console.error('FaceLogin init error:', err);
                setError('Không thể truy cập Camera. Vui lòng cấp quyền.');
            }
        };

        init();

        return () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, [isOpen]);

    // 2. Ensure stream is attached to video element when it becomes available
    useEffect(() => {
        const isLoading = !modelsReady || !usersLoaded;
        if (isOpen && !isLoading && videoRef.current && stream && !videoRef.current.srcObject) {
            videoRef.current.srcObject = stream;
            console.log('✅ Stream attached to video element after loading');
        }
    }, [isOpen, modelsReady, usersLoaded, stream]);

    // Face Detection Loop
    useEffect(() => {
        if (!isOpen || !modelsReady || !videoRef.current || loginSuccess || isScanning) return;

        let animationId: number;
        const STABILITY_THRESHOLD = 300; // Faster auth (0.3s)
        const PROCESSING_THROTTLE = 60; // ~16 FPS for smoother tracking
        const CONFIDENCE_THRESHOLD = 42; // More practical sensitivity

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || loginSuccess || isScanning) {
                animationId = requestAnimationFrame(loop);
                return;
            }

            if (lockoutTime && Date.now() < lockoutTime) {
                const waitSecs = Math.ceil((lockoutTime - Date.now()) / 1000);
                setGuidance(`Quá nhiều lần thử. Vui lòng đợi ${waitSecs}s`);
                animationId = requestAnimationFrame(loop);
                return;
            }

            const now = Date.now();
            if (now - lastProcessedTimeRef.current < PROCESSING_THROTTLE) {
                animationId = requestAnimationFrame(loop);
                return;
            }
            lastProcessedTimeRef.current = now;

            try {
                // Detect with landmarks for blink detection
                const detections = await faceapi.detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                    .withFaceLandmarks();

                const hasFace = !!detections;
                setFaceDetected(hasFace);

                if (hasFace && detections) {
                    const box = detections.detection.box;
                    const videoWidth = videoRef.current.videoWidth;
                    const faceWidthRatio = box.width / videoWidth;

                    // Low light detection (simple average pixel intensity check could go here, 
                    // but we'll use a timer fallback for simplicity and stability)

                    if (faceWidthRatio < 0.2) {
                        setGuidance('Lại gần hơn chút nữa');
                        stableStartTimeRef.current = null;
                        setStabilityProgress(0);
                    } else if (faceWidthRatio > 0.65) {
                        setGuidance('Lùi lại một chút');
                        stableStartTimeRef.current = null;
                        setStabilityProgress(0);
                    } else if (!usersLoaded) {
                        setGuidance('Đang tải dữ liệu...');
                    } else {
                        // Face is in perfect position
                        if (!stableStartTimeRef.current) stableStartTimeRef.current = now;
                        const duration = now - stableStartTimeRef.current;

                        const progress = Math.min(100, (duration / 800) * 100);
                        setStabilityProgress(progress);
                        setGuidance('Giữ nguyên vị trí...');

                        if (duration >= 800) {
                            // START RADAR SCAN
                            startRadarProcess();
                        }
                    }
                } else {
                    setGuidance('Di chuyển khuôn mặt vào khung hình');
                    setStabilityProgress(0);
                    stableStartTimeRef.current = null;

                    // Trigger flash if no face for 3s
                    if (stableStartTimeRef.current === null && !isLowLight) {
                        // Check low light timer
                    }
                }
            } catch (e) {
                console.error('FaceLogin detection error', e);
            }

            animationId = requestAnimationFrame(loop);
        };

        const startRadarProcess = () => {
            setIsScanning(true);
            soundService.play('warning');

            // Visual radar progress (2.5s total to allow for blink)
            let prog = 0;
            const interval = setInterval(() => {
                prog += 2;
                setScanProgress(prog);

                // Play radar sweep sound
                if (prog % 20 === 0) soundService.play('camera');

                // Guidance
                if (prog > 30 && prog < 85) {
                    setGuidance('ĐANG XÁC THỰC DANH TÍNH...');
                }

                // Check for face presence in background
                checkPresence(interval);

                if (prog >= 100) {
                    clearInterval(interval);
                    performRadarAuth();
                }
            }, 40);
        };

        const checkPresence = async (interval: NodeJS.Timeout) => {
            if (!videoRef.current) return;

            const detections = await faceapi.detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
                .withFaceLandmarks();

            if (!detections) {
                // FACE LOST DURING SCAN!
                clearInterval(interval);
                setIsScanning(false);
                setScanProgress(0);
                setGuidance('Quét thất bại: Mất dấu khuôn mặt');
                soundService.play('error');
                stableStartTimeRef.current = null;
                setStabilityProgress(0);
                return;
            }
        };

        const performRadarAuth = async () => {
            if (!videoRef.current) return;

            setGuidance('Đang phân tích sinh trắc học...');
            // Extra wait for drama
            await new Promise(r => setTimeout(r, 500));

            try {
                const fullDetection = await faceService.getFaceDescriptor(videoRef.current);

                if (fullDetection) {
                    const match = faceService.faceMatcher.findMatch(fullDetection, CONFIDENCE_THRESHOLD);

                    if (match) {
                        const userRes = await dataService.getUser(match.userId);
                        if (userRes.success && userRes.data) {
                            soundService.play('success');
                            setLoginSuccess(true);
                            setMatchedUser(userRes.data);
                            setGuidance('Xin chào ' + userRes.data.full_name);
                            setTimeout(() => {
                                onLoginSuccess(userRes.data!);
                            }, 1000);
                            return;
                        }
                    }
                }

                handleFailure();

            } catch (e) {
                console.error('Radar auth error', e);
                setIsScanning(false);
            }
        };

        const handleFailure = () => {
            soundService.play('error');
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);

            if (newAttempts >= 5) {
                setLockoutTime(Date.now() + 60000);
                setError('Quá 5 lần thử. Vui lòng thử lại sau.');
            } else {
                setGuidance(`Không khớp. Thử lại lần ${newAttempts}/5`);
            }

            setTimeout(() => {
                setIsScanning(false);
                setScanProgress(0);
                stableStartTimeRef.current = null;
                setStabilityProgress(0);
            }, 3000);
        };

        loop();
        return () => cancelAnimationFrame(animationId);
    }, [isOpen, modelsReady, usersLoaded, loginSuccess, isScanning, attempts, lockoutTime]);

    // Cleanup stream when modal closes
    useEffect(() => {
        if (!isOpen && stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
            // Reset state
            setModelsReady(false);
            setUsersLoaded(false);
            setLoginSuccess(false);
            setMatchedUser(null);
            setStabilityProgress(0);
            setDetectedPerson(null);
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isLoading = !modelsReady || !usersLoaded;

    return (
        <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex justify-between items-center p-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-white/10 backdrop-blur-sm p-2 rounded-xl border border-white/20">
                        <Camera className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white">Đăng nhập bằng Khuôn mặt</h2>
                        <p className="text-xs text-indigo-300">Xác thực AI không cần mật khẩu</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all backdrop-blur-sm border border-white/20"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
                {/* Loading State */}
                {isLoading && (
                    <div className="text-center">
                        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-pulse shadow-2xl shadow-indigo-500/30">
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{guidance}</h3>
                        <p className="text-indigo-300 text-sm">Vui lòng chờ trong giây lát...</p>

                        {/* Loading Steps */}
                        <div className="mt-8 space-y-3 max-w-xs mx-auto">
                            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${modelsReady ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/10 border border-white/10'}`}>
                                {modelsReady ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                ) : (
                                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                                )}
                                <span className={`text-sm font-medium ${modelsReady ? 'text-emerald-400' : 'text-white'}`}>
                                    {modelsReady ? 'AI đã sẵn sàng' : 'Đang tải AI nhận diện...'}
                                </span>
                            </div>
                            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${usersLoaded ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/10 border border-white/10'}`}>
                                {usersLoaded ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                ) : (
                                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                                )}
                                <span className={`text-sm font-medium ${usersLoaded ? 'text-emerald-400' : 'text-white'}`}>
                                    {usersLoaded ? 'Dữ liệu khuôn mặt sẵn sàng' : 'Đang đồng bộ dữ liệu...'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Camera View */}
                {!isLoading && !loginSuccess && (
                    <div className="relative w-full max-w-sm md:max-w-md aspect-[3/4] rounded-2xl md:rounded-3xl overflow-hidden bg-black shadow-2xl border-2 md:border-4 border-white/20">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover scale-x-[-1]"
                        />

                        {/* Face Frame Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div
                                className={`w-48 h-64 rounded-[3rem] border-4 transition-all duration-300 relative ${faceDetected
                                    ? (guidance.includes('Lại gần') || guidance.includes('Lùi lại'))
                                        ? 'border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]'
                                        : stabilityProgress >= 100
                                            ? 'border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.5)]'
                                            : 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                                    : 'border-white/40'
                                    }`}
                            >
                                {/* Radar Line */}
                                {isScanning && (
                                    <div
                                        className="absolute left-0 right-0 h-10 bg-gradient-to-b from-cyan-400/30 via-cyan-400 to-transparent shadow-[0_5px_15px_rgba(34,211,238,0.5)] z-20 pointer-events-none"
                                        style={{
                                            top: `${scanProgress - 5}%`,
                                            opacity: scanProgress > 5 && scanProgress < 95 ? 1 : 0,
                                            transition: 'opacity 0.2s'
                                        }}
                                    >
                                        <div className="w-full h-[2px] bg-cyan-300 shadow-[0_0_10px_#22d3ee]" />
                                    </div>
                                )}

                                {/* Scanning Glow */}
                                {isScanning && (
                                    <div className="absolute inset-0 bg-cyan-400/10 animate-pulse" />
                                )}

                                {/* Blink Hint */}
                                {isScanning && (
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg">
                                        ĐANG PHÂN TÍCH...
                                    </div>
                                )}

                                {/* Progress Ring */}
                                {faceDetected && !isScanning && stabilityProgress > 0 && stabilityProgress < 100 && (
                                    <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)]" viewBox="0 0 200 250">
                                        <ellipse
                                            cx="100"
                                            cy="125"
                                            rx="96"
                                            ry="127"
                                            fill="none"
                                            stroke="rgba(99,102,241,0.3)"
                                            strokeWidth="4"
                                        />
                                        <ellipse
                                            cx="100"
                                            cy="125"
                                            rx="96"
                                            ry="127"
                                            fill="none"
                                            stroke="#6366f1"
                                            strokeWidth="4"
                                            strokeDasharray={`${stabilityProgress * 7} 700`}
                                            strokeLinecap="round"
                                            className="transition-all duration-100"
                                        />
                                    </svg>
                                )}
                            </div>
                        </div>

                        {/* Guidance Text */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                            <p className={`text-center font-bold text-lg transition-colors ${faceDetected && (guidance.includes('Lại gần') || guidance.includes('Lùi lại')) ? 'text-rose-400' : 'text-white'}`}>
                                {guidance}
                            </p>
                            {detectedPerson && (
                                <p className="text-indigo-300 text-center text-sm mt-1">
                                    {detectedPerson.name} • {detectedPerson.confidence}% khớp
                                </p>
                            )}
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white px-4 py-3 rounded-xl flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Success State */}
                {loginSuccess && matchedUser && (
                    <div className="text-center animate-in zoom-in-95 duration-500">
                        <div className="w-32 h-32 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/40">
                            <CheckCircle className="w-16 h-16 text-white" />
                        </div>
                        <h3 className="text-3xl font-black text-white mb-2">Xin chào!</h3>
                        <p className="text-2xl text-emerald-300 font-bold">{matchedUser.full_name}</p>
                        <p className="text-indigo-300 text-sm mt-2">Đang chuyển hướng...</p>
                    </div>
                )}
            </div>

            {/* Low Light Flash Overlay */}
            {isLowLight && !loginSuccess && (
                <div className="fixed inset-0 bg-white z-[110] animate-pulse pointer-events-none opacity-40 shadow-[inset_0_0_100px_rgba(255,255,255,1)]" />
            )}

            {/* Footer - Switch to Email Login */}
            {!loginSuccess && (
                <div className="p-6 text-center z-20">
                    <div className="flex flex-col items-center gap-4">
                        <label className="flex items-center gap-2 text-white/60 text-sm mb-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={isLowLight}
                                onChange={(e) => setIsLowLight(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-white/10 text-indigo-500 focus:ring-indigo-500"
                            />
                            <span>Bù sáng ban đêm {isLowLight && '🚀'}</span>
                        </label>

                        <button
                            onClick={onClose}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all backdrop-blur-sm border border-white/20 active:scale-95"
                        >
                            <Mail className="w-5 h-5" />
                            Đăng nhập bằng Email
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse-ring {
                    0% { transform: scale(0.95); opacity: 0.5; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                    100% { transform: scale(0.95); opacity: 0.5; }
                }
                .scan-active {
                    animation: pulse-ring 2s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default FaceLoginModal;

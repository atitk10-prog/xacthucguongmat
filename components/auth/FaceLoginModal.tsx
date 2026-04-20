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
    const [isCapturing, setIsCapturing] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);

    const [attempts, setAttempts] = useState(0);
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
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                });
                setStream(newStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = newStream;
                }

                // 2. Load Face Models (skip if already cached from preload or previous session)
                if (!faceService.isModelsLoaded()) {
                    setGuidance('Đang khởi tạo AI...');
                    await faceService.loadModels();
                }
                setModelsReady(true);

                // 3. Load Users (skip if already cached)
                const currentCount = faceService.faceMatcher.getCount();
                if (currentCount === 0) {
                    setGuidance('Đang đồng bộ dữ liệu...');
                    const response = await dataService.getUsers({ status: 'active' });
                    if (response.success && response.data) {
                        const userIds = response.data.map(u => u.id);
                        const descriptorRes = await dataService.getFaceDescriptors(userIds);

                        faceService.faceMatcher.clearAll();
                        if (descriptorRes.success && descriptorRes.data) {
                            const descriptors = descriptorRes.data;
                            for (const user of response.data) {
                                const descStr = descriptors[user.id];
                                if (descStr) {
                                    try {
                                        const descriptor = faceService.stringToDescriptor(descStr);
                                        if (descriptor.length > 0) {
                                            faceService.faceMatcher.registerFace(user.id, descriptor, user.full_name);
                                        }
                                    } catch (e) { }
                                }
                            }
                        }
                    }
                }
                setUsersLoaded(true);
                setGuidance('Đưa khuôn mặt vào khung hình');

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

    useEffect(() => {
        if (!isOpen || !modelsReady || !videoRef.current || loginSuccess) return;

        let animationId: number;
        const STABILITY_THRESHOLD = 600; // 0.6s — nhanh, UX tốt
        const PROCESSING_THROTTLE = 120; // ~8 FPS — mượt trên ĐT trung bình
        const CONFIDENCE_THRESHOLD = 55; // Raised from 42 — prevents wrong-person login

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || loginSuccess || isProcessing || capturedImage) {
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
                // USE TINY FACE DETECTOR + detectSingleFace for max speed
                const detections = await faceapi.detectSingleFace(
                    videoRef.current,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })
                );

                const hasFace = !!detections;
                setFaceDetected(hasFace);

                if (hasFace && detections) {
                    const box = detections.box;
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

                        const progress = Math.min(100, Math.floor((duration / STABILITY_THRESHOLD) * 100));
                        setStabilityProgress(progress);

                        if (progress >= 100) {
                            // SNAPSHOT MODE: Trigger capture
                            captureAndAuth();
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


        const captureAndAuth = async () => {
            if (!videoRef.current || isProcessing) return;

            // 1. Flash effect
            setIsCapturing(true);
            soundService.play('camera');

            // 2. Capture frame to canvas
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Mirror the image because video is mirrored
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoRef.current, 0, 0);
            }
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setCapturedImage(dataUrl);

            // 3. Stop background loop and start processing
            setIsProcessing(true);
            setGuidance('Đang phân tích ảnh...');

            setTimeout(() => {
                setIsCapturing(false);
            }, 300);

            try {
                // Perform deep auth on the captured image (320px for high accuracy)
                const img = await faceService.base64ToImage(dataUrl);
                const allDetections = await faceapi.detectAllFaces(
                    img,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
                )
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                if (allDetections.length > 0) {
                    const sortedDetections = [...allDetections].sort((a, b) =>
                        (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height)
                    );

                    let bestMatch = null;
                    for (const det of sortedDetections) {
                        const match = faceService.faceMatcher.findMatch(det.descriptor, CONFIDENCE_THRESHOLD);
                        if (match) {
                            bestMatch = match;
                            break;
                        }
                    }

                    if (bestMatch) {
                        const userRes = await dataService.getUser(bestMatch.userId);
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
                console.error('Auth error', e);
                setIsProcessing(false);
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
                setGuidance(`Không khớp khuôn mặt.`);
            }
            setIsProcessing(false);
            // No auto-reset
        };

        loop();
        return () => cancelAnimationFrame(animationId);
    }, [isOpen, modelsReady, usersLoaded, loginSuccess, attempts, lockoutTime]);

    // Cleanup stream when modal closes
    useEffect(() => {
        if (!isOpen && stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
            // Reset UI state only — keep modelsReady & usersLoaded cached!
            setLoginSuccess(false);
            setMatchedUser(null);
            setStabilityProgress(0);
            setDetectedPerson(null);
            setError(null);
            setCapturedImage(null);
            setIsCapturing(false);
            setIsProcessing(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isLoading = !modelsReady || !usersLoaded;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-in fade-in duration-200">
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
                {/* Direct Camera View - No more blocking Loading Screen */}
                {!loginSuccess && (
                    <div className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-black border-2 border-white/10">
                        {capturedImage ? (
                            <img
                                src={capturedImage}
                                className="w-full h-full object-cover"
                                alt="Captured face"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover scale-x-[-1]"
                            />
                        )}

                        {/* Flash Effect */}
                        {isCapturing && (
                            <div className="absolute inset-0 bg-white z-[50] animate-in fade-in out-fade duration-300" />
                        )}

                        {/* Face Frame Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div
                                className={`w-48 h-64 rounded-[3rem] border-4 transition-all duration-300 relative ${faceDetected
                                    ? stabilityProgress >= 100 || isProcessing
                                        ? 'border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.5)]'
                                        : 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                                    : 'border-white/40'
                                    }`}
                            >
                                {/* Simple Inner Glow for Processing */}
                                {isProcessing && (
                                    <div className="absolute inset-0 bg-emerald-400/10 animate-pulse rounded-[3rem]" />
                                )}

                                {/* Status Label */}
                                {isProcessing && (
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg">
                                        ĐANG XỬ LÝ...
                                    </div>
                                )}

                                {/* Progress Ring */}
                                {faceDetected && !isProcessing && stabilityProgress > 0 && stabilityProgress < 100 && (
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
                        {/* Small Loading Overlay if AI not ready or processing */}
                        {(isLoading || isProcessing) && (
                            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-[30]">
                                <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                                    <span className="text-xs text-white font-medium">
                                        {isProcessing ? 'Đang xác thực...' : 'Đang tải cấu hình AI...'}
                                    </span>
                                </div>
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

            {/* Footer - Switch to Email Login or Retry */}
            {!loginSuccess && (
                <div className="p-6 text-center z-20">
                    <div className="flex flex-col items-center gap-4">
                        {capturedImage && !isProcessing && (
                            <button
                                onClick={() => {
                                    setCapturedImage(null);
                                    stableStartTimeRef.current = null;
                                    setStabilityProgress(0);
                                    setIsProcessing(false);
                                    setGuidance('Đưa khuôn mặt vào khung hình');
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
                            >
                                <RefreshCw className="w-5 h-5" />
                                Nhận diện lại
                            </button>
                        )}

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

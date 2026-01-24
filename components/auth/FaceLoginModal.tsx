import React, { useState, useRef, useEffect } from 'react';
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

    // Sync ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // Initialize everything when modal opens
    useEffect(() => {
        if (!isOpen) return;

        const init = async () => {
            try {
                setGuidance('Đang tải AI nhận diện...');
                setError(null);

                // 1. Load Face Models
                await faceService.loadModels();
                setModelsReady(true);

                // 2. Load Users with face_descriptor
                setGuidance('Đang đồng bộ dữ liệu khuôn mặt...');
                const response = await dataService.getUsers({ status: 'active' });
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
                            } catch (e) { console.warn('Invalid descriptor for', user.full_name); }
                        }
                    }
                    console.log(`[FaceLogin] Loaded ${count} faces`);
                    setUsersLoaded(true);
                    setGuidance('Đưa khuôn mặt vào khung hình');
                } else {
                    setError('Không thể tải dữ liệu người dùng');
                }

                // 3. Start Camera
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                setStream(newStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = newStream;
                }

            } catch (err) {
                console.error('FaceLogin init error:', err);
                setError('Lỗi khởi tạo camera hoặc AI');
            }
        };

        init();

        // Cleanup on unmount/close
        return () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, [isOpen]);

    // Face Detection Loop
    useEffect(() => {
        if (!isOpen || !modelsReady || !usersLoaded || !videoRef.current || loginSuccess) return;

        let animationId: number;
        const STABILITY_THRESHOLD = 400; // Optimized for speed (0.4s)
        const PROCESSING_THROTTLE = 100; // ~10 FPS
        const CONFIDENCE_THRESHOLD = 48; // Slightly more balanced sensitivity

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
                animationId = requestAnimationFrame(loop);
                return;
            }

            if (isProcessingRef.current) {
                setTimeout(() => { animationId = requestAnimationFrame(loop); }, 200);
                return;
            }

            const now = Date.now();
            if (now - lastProcessedTimeRef.current < PROCESSING_THROTTLE) {
                animationId = requestAnimationFrame(loop);
                return;
            }
            lastProcessedTimeRef.current = now;

            try {
                const detections = await faceService.detectFaces(videoRef.current);
                let primaryDetection = null;

                if (detections.length > 0) {
                    primaryDetection = detections.sort((a, b) =>
                        (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height)
                    )[0];
                }

                const hasFace = !!primaryDetection;
                setFaceDetected(hasFace);

                if (hasFace && primaryDetection) {
                    const box = primaryDetection.detection.box;
                    const videoWidth = videoRef.current.videoWidth;
                    const faceWidthRatio = box.width / videoWidth;

                    if (faceWidthRatio < 0.15) {
                        setGuidance('Lại gần hơn chút nữa');
                        stableStartTimeRef.current = null;
                        setStabilityProgress(0);
                        recognizedPersonRef.current = null;
                        setDetectedPerson(null);
                    } else if (faceWidthRatio > 0.6) {
                        setGuidance('Lùi lại một chút');
                        stableStartTimeRef.current = null;
                        setStabilityProgress(0);
                        recognizedPersonRef.current = null;
                        setDetectedPerson(null);
                    } else {
                        // Good size - identify
                        const match = faceService.faceMatcher.findMatch(primaryDetection.descriptor, CONFIDENCE_THRESHOLD);

                        if (match) {
                            const prev = recognizedPersonRef.current;

                            if (prev && prev.id === match.userId) {
                                // Same person - track stability
                                if (!stableStartTimeRef.current) stableStartTimeRef.current = now;

                                const stableDuration = now - stableStartTimeRef.current;
                                const progress = Math.min(100, (stableDuration / STABILITY_THRESHOLD) * 100);
                                setStabilityProgress(progress);
                                setGuidance(`Giữ yên... ${Math.round(progress)}%`);
                                setDetectedPerson({ name: match.name, confidence: match.confidence });

                                if (stableDuration >= STABILITY_THRESHOLD && !isProcessingRef.current) {
                                    // TRIGGER LOGIN
                                    setIsProcessing(true);
                                    setGuidance('Đang xác thực...');

                                    // Fetch full user data
                                    const userRes = await dataService.getUser(match.userId);
                                    if (userRes.success && userRes.data) {
                                        soundService.play('success');
                                        setLoginSuccess(true);
                                        setMatchedUser(userRes.data);
                                        setGuidance('Đăng nhập thành công!');

                                        // Auto-close and login after 2s
                                        setTimeout(() => {
                                            onLoginSuccess(userRes.data!);
                                        }, 2000);
                                    } else {
                                        soundService.play('error');
                                        setError('Không thể lấy thông tin người dùng');
                                        setIsProcessing(false);
                                    }
                                }
                            } else {
                                // New person detected
                                recognizedPersonRef.current = { id: match.userId, name: match.name, confidence: match.confidence };
                                stableStartTimeRef.current = now;
                                setStabilityProgress(0);
                                setGuidance('Nhận diện được khuôn mặt, giữ yên...');
                            }
                        } else {
                            // Unknown face
                            setGuidance('Khuôn mặt chưa được đăng ký');
                            setDetectedPerson(null);
                            stableStartTimeRef.current = null;
                            setStabilityProgress(0);
                            recognizedPersonRef.current = null;
                        }
                    }
                } else {
                    setGuidance('Di chuyển khuôn mặt vào khung hình');
                    setStabilityProgress(0);
                    stableStartTimeRef.current = null;
                    recognizedPersonRef.current = null;
                    setDetectedPerson(null);
                }
            } catch (e) {
                console.error('FaceLogin detection error', e);
            }

            animationId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(animationId);
    }, [isOpen, modelsReady, usersLoaded, loginSuccess]);

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
                                className={`w-48 h-60 rounded-[3rem] border-4 transition-all duration-300 ${faceDetected
                                    ? stabilityProgress >= 100
                                        ? 'border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.5)]'
                                        : 'border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.4)]'
                                    : 'border-white/40'
                                    }`}
                            >
                                {/* Progress Ring */}
                                {faceDetected && stabilityProgress > 0 && stabilityProgress < 100 && (
                                    <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)]" viewBox="0 0 200 250">
                                        <ellipse
                                            cx="100"
                                            cy="125"
                                            rx="96"
                                            ry="121"
                                            fill="none"
                                            stroke="rgba(99,102,241,0.3)"
                                            strokeWidth="4"
                                        />
                                        <ellipse
                                            cx="100"
                                            cy="125"
                                            rx="96"
                                            ry="121"
                                            fill="none"
                                            stroke="#6366f1"
                                            strokeWidth="4"
                                            strokeDasharray={`${stabilityProgress * 6.7} 670`}
                                            strokeLinecap="round"
                                            className="transition-all duration-100"
                                        />
                                    </svg>
                                )}
                            </div>
                        </div>

                        {/* Guidance Text */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                            <p className="text-white text-center font-bold text-lg">{guidance}</p>
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

            {/* Footer - Switch to Email Login */}
            {!loginSuccess && (
                <div className="p-6 text-center">
                    <button
                        onClick={onClose}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all backdrop-blur-sm border border-white/20"
                    >
                        <Mail className="w-5 h-5" />
                        Đăng nhập bằng Email
                    </button>
                </div>
            )}
        </div>
    );
};

export default FaceLoginModal;

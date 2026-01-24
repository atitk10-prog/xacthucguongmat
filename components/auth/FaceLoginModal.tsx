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
        const STABILITY_THRESHOLD = 300; // Faster auth (0.3s)
        const PROCESSING_THROTTLE = 60; // ~16 FPS for smoother tracking
        const CONFIDENCE_THRESHOLD = 42; // More practical sensitivity

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
                animationId = requestAnimationFrame(loop);
                return;
            }

            if (isProcessingRef.current) {
                setTimeout(() => { animationId = requestAnimationFrame(loop); }, 150);
                return;
            }

            const now = Date.now();
            if (now - lastProcessedTimeRef.current < PROCESSING_THROTTLE) {
                animationId = requestAnimationFrame(loop);
                return;
            }
            lastProcessedTimeRef.current = now;

            try {
                // Optimized: Detect ONLY ONE face for login
                const detections = await faceService.detectFaces(videoRef.current, true);
                const primaryDetection = detections.length > 0 ? detections[0] : null;

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
        <div className="fixed inset-0 z-[100] bg-black overflow-hidden font-sans select-none animate-in fade-in duration-300">
            {/* ========== BACKGROUND CAMERA ========== */}
            <div className="absolute inset-0 z-0 bg-slate-950">
                {!isLoading && !loginSuccess && (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                    />
                )}

                {/* Overlays for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none"></div>

                {/* Scanner Line Effect */}
                {!isLoading && !loginSuccess && stream && (
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-indigo-400/50 shadow-[0_0_20px_rgba(129,140,248,0.8)] z-10 animate-scanline"></div>
                )}
            </div>

            {/* ========== HEADER ========== */}
            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between h-20 px-4 pt-safe">
                <div className="flex items-center gap-3">
                    <div className="bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-lg">
                        <Camera className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white leading-tight">AI Face Login</h2>
                        <p className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold">Secure ID Processing</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-white border border-white/10 active:scale-90 transition-all shadow-lg"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* ========== MAIN INTERACTION AREA ========== */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none p-6">

                {/* LOADING STATE */}
                {isLoading && (
                    <div className="text-center animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 animate-pulse shadow-2xl shadow-indigo-500/30">
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                        </div>
                        <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-2xl max-w-xs">
                            <h3 className="text-white font-black text-lg mb-2">{guidance}</h3>
                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 animate-progress origin-left"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* SCANNING FRAME (VISUAL FEEDBACK) */}
                {!isLoading && !loginSuccess && (
                    <div className="relative w-[80vw] sm:w-80 h-[100vw] sm:h-96 mb-12">
                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white/30 rounded-tl-3xl"></div>
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white/30 rounded-tr-3xl"></div>
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white/30 rounded-bl-3xl"></div>
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white/30 rounded-br-3xl"></div>

                        {/* Smart Border */}
                        <div className={`absolute inset-0 border-2 rounded-3xl transition-all duration-300 ${faceDetected
                                ? (stabilityProgress >= 100
                                    ? 'border-emerald-400 shadow-[0_0_50px_rgba(52,211,153,0.3)] bg-emerald-500/5'
                                    : guidance.includes('Lùi') || guidance.includes('Lại gần')
                                        ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)] bg-red-500/5'
                                        : 'border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.2)] bg-indigo-500/5')
                                : 'border-white/10'
                            }`}>

                            {/* Inner Scanning Effect */}
                            {faceDetected && !isProcessing && stabilityProgress > 0 && stabilityProgress < 100 && (
                                <div className="absolute inset-0 overflow-hidden rounded-3xl">
                                    <div
                                        className="absolute bottom-0 left-0 right-0 bg-indigo-500/20 transition-all duration-300"
                                        style={{ height: `${stabilityProgress}%` }}
                                    ></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-4xl font-black text-white/80 drop-shadow-2xl">{Math.round(stabilityProgress)}%</span>
                                    </div>
                                </div>
                            )}

                            {/* Processing Spinner */}
                            {isProcessing && (
                                <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/20 backdrop-blur-[2px] rounded-3xl">
                                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SUCCESS STATE */}
                {loginSuccess && matchedUser && (
                    <div className="text-center animate-in zoom-in-95 duration-500">
                        <div className="w-32 h-32 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/40">
                            <CheckCircle className="w-16 h-16 text-white" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-4xl font-black text-white tracking-tight">XÁC THỰC XONG</h3>
                            <p className="text-2xl text-emerald-300 font-bold uppercase">{matchedUser.full_name}</p>
                            <p className="text-indigo-300/60 font-medium pt-2">Đang chuyển sang trang chính...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ========== FLOATING GUIDANCE & ERROR ========== */}
            <div className="absolute bottom-12 left-0 right-0 z-40 flex flex-col items-center gap-6 px-6 pointer-events-none">
                {/* GUIDANCE BAR */}
                {!isLoading && !loginSuccess && (
                    <div className={`px-8 py-4 rounded-2xl backdrop-blur-xl border-2 flex items-center gap-4 shadow-2xl transition-all duration-300 ${!faceDetected
                            ? 'bg-black/60 border-white/10'
                            : guidance.includes('Lùi') || guidance.includes('Lại gần')
                                ? 'bg-red-600/80 border-red-400/50 scale-105'
                                : 'bg-indigo-600/80 border-indigo-400/50 scale-105 animate-pulse'
                        }`}>
                        <div className="p-2 bg-white/10 rounded-xl">
                            {guidance.includes('Lùi') || guidance.includes('Lại gần') ? <AlertTriangle className="w-5 h-5 text-white" /> : <UserIcon className="w-5 h-5 text-white" />}
                        </div>
                        <span className="text-white font-black text-sm sm:text-lg uppercase tracking-wider">
                            {guidance}
                        </span>
                    </div>
                )}

                {/* ALTERNATIVE LOGIN BUTTON */}
                {!loginSuccess && (
                    <button
                        onClick={onClose}
                        className="pointer-events-auto flex items-center gap-3 px-8 h-14 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-sm transition-all backdrop-blur-md border border-white/10 shadow-xl active:scale-95"
                    >
                        <Mail className="w-5 h-5" />
                        DÙNG EMAIL ĐĂNG NHẬP
                    </button>
                )}

                {/* ERROR MESSAGE */}
                {error && (
                    <div className="bg-red-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-3 shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <AlertTriangle className="w-5 h-5" />
                        {error}
                    </div>
                )}
            </div>

            {/* ========== CUSTOM STYLES ========== */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .pt-safe { padding-top: env(safe-area-inset-top); }
                @keyframes scanline {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scanline {
                    animation: scanline 4s linear infinite;
                }
                @keyframes progress-origin {
                    0% { transform: scaleX(0); }
                    100% { transform: scaleX(1); }
                }
                .animate-progress {
                    animation: progress-origin 2s ease-in-out infinite;
                }
            ` }} />
        </div>
    );
};

export default FaceLoginModal;

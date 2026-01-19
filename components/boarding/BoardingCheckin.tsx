import React, { useState, useRef, useEffect } from 'react';
import { dataService, CheckinType } from '../../services/dataService';
import { faceService } from '../../services/faceService';
import { soundService } from '../../services/soundService';
import { qrScannerService } from '../../services/qrScannerService';
import { User, BoardingCheckin as BoardingCheckinType, BoardingConfig } from '../../types';
import {
    Camera, RefreshCw, UserCheck, AlertTriangle, CheckCircle,
    ArrowDown, ArrowUp, Clock, History, ChevronLeft, MapPin,
    Moon, Sun, Sunrise, Sunset, Settings, Save, X, QrCode, User as UserIcon
} from 'lucide-react';

interface BoardingCheckinProps {
    currentUser?: User;
    onBack?: () => void;
}



const BoardingCheckin: React.FC<BoardingCheckinProps> = ({ onBack }) => {
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const checkinCooldownsRef = useRef<Map<string, number>>(new Map());
    const stableStartTimeRef = useRef<number | null>(null); // For temporal analysis
    const lastProcessedTimeRef = useRef<number>(0);
    const recognizedPersonRef = useRef<{ id: string; name: string; confidence: number } | null>(null);
    const isProcessingRef = useRef(false);

    // State
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedType, setSelectedType] = useState<CheckinType>('morning_in');
    const [modelsReady, setModelsReady] = useState(false);
    const [studentsLoaded, setStudentsLoaded] = useState(false);
    const [faceDetected, setFaceDetected] = useState(false);
    const [detectedPerson, setDetectedPerson] = useState<{ name: string; confidence: number } | null>(null); // For UI only
    const [guidance, setGuidance] = useState<string>('Đang tìm khuôn mặt...');
    const [stabilityProgress, setStabilityProgress] = useState(0); // 0-100%

    // QR Check-in Mode
    const [checkinMode, setCheckinMode] = useState<'face' | 'qr'>('face');
    const [studentsData, setStudentsData] = useState<User[]>([]); // Store students for QR lookup
    const [qrScannerActive, setQrScannerActive] = useState(false);

    // Results
    const [result, setResult] = useState<{ success: boolean; message: string; data?: BoardingCheckinType; user?: User; status?: 'late' | 'on_time' } | null>(null);
    const [recentCheckins, setRecentCheckins] = useState<Array<{ name: string; time: string; type: string; status: string; avatar?: string }>>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configForm, setConfigForm] = useState<BoardingConfig>({
        morning_curfew: '07:00',
        noon_curfew: '12:30',
        evening_curfew: '22:00'
    });

    // Sync ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // Auto-select type based on time
    useEffect(() => {
        const h = new Date().getHours();
        if (h >= 5 && h < 11) setSelectedType('morning_in');
        else if (h >= 11 && h < 12) setSelectedType('noon_in'); // 11h-12h
        else if (h >= 12 && h < 13) setSelectedType('noon_out'); // 12h-13h (Corrected logic for noon out)
        else if (h >= 13 && h < 17) setSelectedType('evening_in'); // 13h-17h Afternoon class?
        else if (h >= 17) setSelectedType('evening_out'); // Night out / Free time
        else setSelectedType('morning_in');
    }, []);

    // Load Config from DB
    const [boardingConfig, setBoardingConfig] = useState<BoardingConfig>({
        morning_curfew: '07:00',
        evening_curfew: '22:00',
        noon_curfew: '12:30'
    });

    useEffect(() => {
        const loadConfig = async () => {
            const res = await dataService.getBoardingConfig();
            if (res.success && res.data) {
                setBoardingConfig(res.data);
                setConfigForm(res.data);
            }
        };
        loadConfig();

        // Try to process offline queue on mount
        dataService.processOfflineQueue();
    }, []);

    const handleSaveConfig = async () => {
        const res = await dataService.updateBoardingConfig(configForm);
        if (res.success) {
            setBoardingConfig(configForm);
            setShowConfigModal(false);
            alert('Cập nhật cấu hình thành công!');
        } else {
            alert('Lỗi: ' + res.error);
        }
    };

    const BOARDING_CONFIG = boardingConfig;

    // Load Models & Students
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Load Face Models
                await faceService.loadModels();
                setModelsReady(true);

                // 2. Load Students
                const response = await dataService.getAllStudentsForCheckin(false); // Load all students
                if (response.success && response.data) {
                    setStudentsData(response.data); // Store for QR lookup
                    faceService.faceMatcher.clearAll(); // Clear old faces
                    let count = 0;
                    for (const user of response.data) {
                        if (user.face_descriptor) {
                            try {
                                const descriptor = new Float32Array(JSON.parse(user.face_descriptor));
                                faceService.faceMatcher.registerFace(user.id, descriptor, user.full_name);
                                count++;
                            } catch (e) { console.warn('Invalid descriptor for', user.full_name); }
                        }
                    }
                    console.log(`Loaded ${count} student faces, ${response.data.length} total students`);
                    setStudentsLoaded(true);
                }
            } catch (err) {
                console.error('Initialization error:', err);
            }
        };
        init();
    }, []);

    // Camera
    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                setStream(stream);
                if (videoRef.current) videoRef.current.srcObject = stream;
            } catch (err) { console.error('Camera error', err); }
        };
        startCamera();
        return () => { stream?.getTracks().forEach(t => t.stop()); };
    }, []);

    // Detect Loop (Optimized + Security)
    useEffect(() => {
        if (!modelsReady || !studentsLoaded || !videoRef.current) return;

        let animationId: number;
        const STABILITY_THRESHOLD = 1200; // 1.2s stable matching required
        const PROCESSING_THROTTLE = 100; // 100ms between runs (10 FPS is enough)

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
                animationId = requestAnimationFrame(loop);
                return;
            }

            // 1. Block if processing a check-in
            if (isProcessingRef.current) {
                setGuidance('Đang xử lý...');
                setStabilityProgress(0);
                setTimeout(() => { animationId = requestAnimationFrame(loop); }, 200);
                return;
            }

            // 2. Throttle Performance
            const now = Date.now();
            if (now - lastProcessedTimeRef.current < PROCESSING_THROTTLE) {
                animationId = requestAnimationFrame(loop);
                return;
            }
            lastProcessedTimeRef.current = now;

            try {
                // 3. Detect Faces
                const detections = await faceService.detectFaces(videoRef.current);

                // 4. Filter & Select Best Face
                let primaryDetection = null;
                if (detections.length > 0) {
                    // Pick the largest face (closest/main user)
                    primaryDetection = detections.sort((a, b) =>
                        (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height)
                    )[0];
                }

                const hasFace = !!primaryDetection;
                setFaceDetected(hasFace);

                if (hasFace && primaryDetection) {
                    const box = primaryDetection.detection.box;
                    const videoWidth = videoRef.current.videoWidth;

                    // 5. Position Guidance/Checks
                    const faceWidthParams = box.width / videoWidth;

                    if (faceWidthParams < 0.15) {
                        setGuidance('Lại gần hơn chút nữa');
                        stableStartTimeRef.current = null; // Reset stability
                        setStabilityProgress(0);
                        recognizedPersonRef.current = null;
                        setDetectedPerson(null);
                    } else if (faceWidthParams > 0.6) {
                        setGuidance('Lùi lại một chút');
                        stableStartTimeRef.current = null;
                        setStabilityProgress(0);
                        recognizedPersonRef.current = null;
                        setDetectedPerson(null);
                    } else {
                        // Size is Good -> Identify
                        const match = faceService.faceMatcher.findMatch(primaryDetection.descriptor, 45); // 45% threshold

                        if (match) {
                            // 6. Security: Anti-Spoofing Temporal Analysis
                            const prev = recognizedPersonRef.current;

                            // Check if it's the SAME person as last frame
                            if (prev && prev.id === match.userId) {
                                // Continue tracking stability
                                if (!stableStartTimeRef.current) stableStartTimeRef.current = now;

                                const stableDuration = now - stableStartTimeRef.current;
                                const progress = Math.min(100, (stableDuration / STABILITY_THRESHOLD) * 100);
                                setStabilityProgress(progress);
                                setGuidance(`Giữ yên... ${Math.round(progress)}%`);
                                setDetectedPerson({ name: match.name, confidence: match.confidence });

                                // Check Cooldown
                                const cooldown = checkinCooldownsRef.current.get(match.userId);
                                const isCool = !cooldown || (now - cooldown > 60000); // 1 min cooldown

                                if (stableDuration >= STABILITY_THRESHOLD) {
                                    // 7. TRIGGER CHECK-IN
                                    if (isCool && !isProcessingRef.current) {
                                        setGuidance('Đang check-in...');
                                        handleAutoCheckin(match.userId, match.name, match.confidence);
                                    } else if (!isCool) {
                                        setGuidance(`Đã check-in rồi (${Math.ceil((60000 - (now - cooldown)) / 1000)}s)`);
                                        setStabilityProgress(100);
                                    }
                                }

                            } else {
                                // New person or switch -> Reset
                                recognizedPersonRef.current = { id: match.userId, name: match.name, confidence: match.confidence };
                                stableStartTimeRef.current = now;
                                setStabilityProgress(0);
                                setGuidance('Giữ yên để xác nhận');
                            }
                        } else {
                            // Face found but unknown
                            setGuidance('Không nhận ra khuôn mặt');
                            setDetectedPerson(null);
                            stableStartTimeRef.current = null;
                            setStabilityProgress(0);
                            recognizedPersonRef.current = null;
                        }
                    }
                } else {
                    // No face
                    setGuidance('Di chuyển khuôn mặt vào khung hình');
                    setStabilityProgress(0);
                    stableStartTimeRef.current = null;
                    recognizedPersonRef.current = null;
                    setDetectedPerson(null);
                }

            } catch (e) { console.error('Detection loop error', e); }

            animationId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(animationId);
    }, [modelsReady, studentsLoaded]);

    const calculateStatus = (type: string, time: Date): 'on_time' | 'late' => {
        const timeStr = time.toTimeString().slice(0, 5); // HH:mm

        if (type === 'morning_in') {
            return timeStr <= BOARDING_CONFIG.morning_curfew ? 'on_time' : 'late';
        }
        if (type === 'noon_in') {
            return timeStr <= BOARDING_CONFIG.noon_curfew ? 'on_time' : 'late';
        }
        if (type === 'evening_in') {
            return timeStr <= BOARDING_CONFIG.evening_curfew ? 'on_time' : 'late';
        }
        return 'on_time';
    };

    const handleAutoCheckin = async (userId: string, name: string, confidence: number) => {
        setIsProcessing(true);
        const now = new Date();
        const status = calculateStatus(selectedType, now);

        // Play Sound
        if (status === 'late') soundService.play('warning');
        else soundService.play('success');

        try {
            // Call API
            const response = await dataService.boardingCheckin(userId, selectedType, status);

            if (response.success) {
                const message = status === 'late'
                    ? `Check-in MUỘN (${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })})`
                    : `Check-in ĐÚNG GIỜ`;

                setResult({
                    success: true,
                    message: message,
                    data: response.data,
                    user: { full_name: name } as any,
                    status: status
                });

                // Update recent list
                setRecentCheckins(prev => [{
                    name: name,
                    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                    type: getTypeLabel(selectedType),
                    status: status === 'late' ? 'warning' : 'success' // Use warning for late
                }, ...prev.slice(0, 9)]);

                // Set Cooldown
                checkinCooldownsRef.current.set(userId, Date.now());

                // Auto close modal
                setTimeout(() => {
                    setResult(null);
                    setIsProcessing(false);
                    // Reset stability to prevent instant re-checkin
                    stableStartTimeRef.current = null;
                    setStabilityProgress(0);
                }, 3000);
            } else {
                // Error (e.g. already checking)
                soundService.play('error');
                checkinCooldownsRef.current.set(userId, Date.now());
                setIsProcessing(false);
            }
        } catch (e) {
            console.error(e);
            soundService.play('error');
            setIsProcessing(false);
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'morning_in': return 'Sáng - Vào Lớp';
            case 'morning_out': return 'Sáng - Ra Về';
            case 'noon_in': return 'Trưa - Vào';
            case 'noon_out': return 'Trưa - Ra';
            case 'evening_in': return 'Tối - Điểm danh';
            case 'evening_out': return 'Tối - Ra';
            default: return type;
        }
    };

    const renderTypeIcon = (type: string) => {
        if (type.includes('morning')) return <Sunrise className="w-5 h-5" />;
        if (type.includes('noon')) return <Sun className="w-5 h-5" />;
        return <Moon className="w-5 h-5" />;
    };

    // QR Check-in Handler
    const handleQRCheckin = async (studentCode: string) => {
        if (isProcessingRef.current) return;

        // Find student by student_code
        const student = studentsData.find(s =>
            s.student_code === studentCode || s.id === studentCode
        );

        if (!student) {
            setGuidance(`Không tìm thấy học sinh: ${studentCode}`);
            soundService.play('error');
            return;
        }

        // Check cooldown
        const now = Date.now();
        const cooldown = checkinCooldownsRef.current.get(student.id);
        if (cooldown && (now - cooldown < 60000)) {
            setGuidance(`${student.full_name} đã check-in (${Math.ceil((60000 - (now - cooldown)) / 1000)}s)`);
            return;
        }

        // Perform check-in
        await handleAutoCheckin(student.id, student.full_name, 100);
    };

    // Switch mode effect
    const switchCheckinMode = async (mode: 'face' | 'qr') => {
        // Stop QR scanner if switching away
        if (checkinMode === 'qr' && mode === 'face') {
            await qrScannerService.stopScanner();
            setQrScannerActive(false);
        }

        setCheckinMode(mode);

        // Start QR scanner if switching to QR mode
        if (mode === 'qr') {
            setGuidance('Đưa mã QR vào khung hình...');
            // Short delay to let DOM update
            setTimeout(async () => {
                try {
                    await qrScannerService.startScanning(
                        'qr-reader',
                        (result) => {
                            if (result.type === 'user' && result.code) {
                                handleQRCheckin(result.code);
                            }
                        },
                        (error) => {
                            console.error('QR Scanner error:', error);
                            setGuidance('Lỗi camera: ' + error);
                        }
                    );
                    setQrScannerActive(true);
                } catch (err) {
                    console.error('Failed to start QR scanner:', err);
                }
            }, 300);
        } else {
            setGuidance('Đang tìm khuôn mặt...');
        }
    };

    // Cleanup QR scanner on unmount
    useEffect(() => {
        return () => {
            qrScannerService.stopScanner();
        };
    }, []);

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col pt-16 px-4 pb-4 gap-4 lg:flex-row font-sans">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-slate-800/80 backdrop-blur-md flex items-center justify-between px-4 z-20 border-b border-white/10">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                    )}
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="bg-indigo-600 p-1.5 rounded-lg">
                            <UserCheck className="w-5 h-5 text-white" />
                        </span>
                        Check-in Nội trú
                    </h1>
                </div>

                {/* Mode Toggle */}
                <div className="flex items-center gap-2 bg-slate-700/50 rounded-xl p-1">
                    <button
                        onClick={() => switchCheckinMode('face')}
                        className={`px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 transition-all ${checkinMode === 'face'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        <UserIcon className="w-4 h-4" />
                        Khuôn mặt
                    </button>
                    <button
                        onClick={() => switchCheckinMode('qr')}
                        className={`px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 transition-all ${checkinMode === 'qr'
                                ? 'bg-emerald-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        <QrCode className="w-4 h-4" />
                        Mã QR
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-white/60 text-sm font-mono flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                </div>
            </div>

            {/* Left: Camera / QR Scanner */}
            <div className="flex-1 relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 group">
                {/* Face Mode: Video */}
                {checkinMode === 'face' && (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                )}

                {/* QR Mode: Scanner Container */}
                {checkinMode === 'qr' && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
                        <div id="qr-reader" className="w-full max-w-md" style={{ minHeight: '300px' }}></div>
                        {!qrScannerActive && (
                            <p className="text-slate-400 mt-4">Đang khởi động camera...</p>
                        )}
                    </div>
                )}

                {/* Overlay UI */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
                    {/* Status Badge */}
                    <div className="self-center flex flex-col items-center gap-2">
                        {isProcessing ? (
                            <div className="bg-indigo-600/90 text-white px-6 py-2 rounded-full font-bold animate-pulse shadow-lg backdrop-blur-sm border border-indigo-400 flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Đang xử lý...
                            </div>
                        ) : detectedPerson ? (
                            <div className={`px-6 py-2 rounded-full font-bold shadow-lg backdrop-blur-sm border flex items-center gap-2 transition-all duration-300 ${stabilityProgress >= 100
                                ? 'bg-emerald-600/90 border-emerald-400 text-white'
                                : 'bg-slate-900/80 border-white/20 text-white'
                                }`}>
                                {stabilityProgress >= 100 ? (
                                    <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                                ) : (
                                    <span className="w-4 h-4 flex items-center justify-center">
                                        <svg className="w-4 h-4 -rotate-90 text-indigo-500" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="62.83" strokeDashoffset={`${62.83 - (stabilityProgress / 100) * 62.83}`}></circle>
                                        </svg>
                                    </span>
                                )}
                                {detectedPerson.name} ({stabilityProgress >= 100 ? 'Sẵn sàng' : `${Math.round(stabilityProgress)}%`})
                            </div>
                        ) : (
                            <div className="bg-slate-900/60 text-white/70 px-6 py-2 rounded-full text-sm backdrop-blur-sm border border-white/10 flex items-center gap-2">
                                <Camera className="w-4 h-4" />
                                {guidance}
                            </div>
                        )}

                        {/* Detection Quality Warning */}
                        {(!detectedPerson && faceDetected) && (
                            <div className="text-amber-400 text-sm font-bold bg-black/50 px-3 py-1 rounded-full backdrop-blur-md animate-bounce">
                                {guidance}
                            </div>
                        )}
                    </div>

                    {/* Header / Settings Button */}
                    <button
                        onClick={() => setShowConfigModal(true)}
                        className="absolute top-4 right-4 z-50 p-2 bg-slate-800/50 backdrop-blur-md rounded-full text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors border border-white/5"
                    >
                        <Settings className="w-5 h-5" />
                    </button>

                    {/* Back Button */}
                    {/* Face Frame */}
                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 border-2 rounded-3xl transition-all duration-300 ${stabilityProgress >= 100
                        ? 'border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.5)] scale-105'
                        : faceDetected
                            ? 'border-white/50'
                            : 'border-white/10'
                        }`}>
                        {/* Center guide */}
                        {!faceDetected && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/10">
                                <UserCheck className="w-24 h-24" strokeWidth={1} />
                            </div>
                        )}

                        {/* Progress Border (Optional, simple version) */}
                        <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-200" style={{ width: `${stabilityProgress}%` }}></div>
                    </div>
                </div>
            </div>

            {/* Right: Controls */}
            <div className="w-full lg:w-96 flex flex-col gap-4">
                {/* Mode Selector */}
                <div className="bg-slate-800/50 backdrop-blur-md p-5 rounded-3xl border border-white/10 shadow-xl">
                    <h3 className="text-white/80 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <MapPin className="w-4 h-4 text-indigo-400" />
                        Chọn khung giờ
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {(['morning_in', 'morning_out', 'noon_in', 'noon_out', 'evening_in', 'evening_out'] as CheckinType[]).map(type => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={`relative p-3 rounded-2xl text-left transition-all duration-200 border ${selectedType === type
                                    ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-900/50 scale-[1.02]'
                                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10'
                                    }`}
                            >
                                <div className="text-xs font-bold uppercase mb-1 opacity-70 flex items-center gap-1">
                                    {renderTypeIcon(type)}
                                    {type.includes('morning') ? 'Sáng' : type.includes('noon') ? 'Trưa' : 'Tối'}
                                </div>
                                <div className={`text-lg font-black flex items-center gap-2 ${selectedType === type ? 'text-white' : 'text-slate-300'}`}>
                                    {type.includes('in') ? <ArrowDown className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
                                    {type.includes('in') ? 'Vào' : 'Ra'}
                                </div>
                                {selectedType === type && (
                                    <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_#34d399]"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Recent Use */}
                <div className="flex-1 bg-slate-800/50 backdrop-blur-md p-5 rounded-3xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
                    <h3 className="text-white/80 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <History className="w-4 h-4 text-emerald-400" />
                        Vừa Check-in
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {recentCheckins.length === 0 ? (
                            <div className="text-center text-slate-500 py-10 italic flex flex-col items-center gap-2">
                                <History className="w-8 h-8 opacity-20" />
                                Chưa có check-in nào
                            </div>
                        ) : (
                            recentCheckins.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl hover:bg-white/10 transition-colors animate-fade-in-down border border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
                                        {item.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold truncate">{item.name}</p>
                                        <p className="text-indigo-300 text-xs flex items-center gap-1">
                                            {item.type} • {item.time}
                                        </p>
                                    </div>
                                    <div className={`${item.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {item.status === 'warning' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Success Popup */}
            {result && result.success && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-slate-800 border border-slate-700 p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center relative overflow-hidden animate-scale-in">
                        {/* Glow effect */}
                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 blur-[50px] rounded-full pointer-events-none ${result.status === 'late' ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}></div>

                        <div className={`w-24 h-24 mx-auto bg-gradient-to-br rounded-full flex items-center justify-center mb-6 shadow-lg ${result.status === 'late' ? 'from-amber-400 to-orange-500 shadow-amber-500/30' : 'from-emerald-400 to-teal-500 shadow-emerald-500/30'}`}>
                            {result.status === 'late' ? (
                                <AlertTriangle className="w-12 h-12 text-white" />
                            ) : (
                                <CheckCircle className="w-12 h-12 text-white" />
                            )}
                        </div>

                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">{result.user?.full_name}</h2>
                        <div className={`border px-4 py-1 rounded-full inline-block font-bold text-sm mb-6 ${result.status === 'late' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                            {result.message}
                        </div>

                        <p className="text-slate-400 text-sm">Cửa sổ sẽ đóng tự động...</p>
                    </div>
                </div>
            )}

            {/* Config Modal */}
            {showConfigModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md relative shadow-2xl animate-scale-in">
                        <button
                            onClick={() => setShowConfigModal(false)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-indigo-400" />
                            Cấu hình khung giờ
                        </h3>
                        <p className="text-slate-400 text-sm mb-6">Điều chỉnh thời gian giới nghiêm cho các buổi.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Giờ giới nghiêm Sáng</label>
                                <input
                                    type="time"
                                    value={configForm.morning_curfew}
                                    onChange={e => setConfigForm({ ...configForm, morning_curfew: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono text-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Giờ giới nghiêm Trưa</label>
                                <input
                                    type="time"
                                    value={configForm.noon_curfew}
                                    onChange={e => setConfigForm({ ...configForm, noon_curfew: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono text-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Giờ giới nghiêm Tối</label>
                                <input
                                    type="time"
                                    value={configForm.evening_curfew}
                                    onChange={e => setConfigForm({ ...configForm, evening_curfew: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono text-lg"
                                />
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button
                                onClick={() => setShowConfigModal(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-white/5 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSaveConfig}
                                className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
                            >
                                <Save className="w-5 h-5" />
                                Lưu cấu hình
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoardingCheckin;

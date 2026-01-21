import React, { useState, useRef, useEffect } from 'react';
import { dataService, CheckinType } from '../../services/dataService';
import { faceService } from '../../services/faceService';
import { soundService } from '../../services/soundService';
import { qrScannerService } from '../../services/qrScannerService';
import { User, BoardingCheckin as BoardingCheckinType, BoardingConfig, BoardingTimeSlot } from '../../types';
import {
    Camera, RefreshCw, UserCheck, AlertTriangle, CheckCircle,
    ArrowDown, ArrowUp, Clock, History, ChevronLeft, MapPin,
    Moon, Sun, Sunrise, Sunset, Settings, Save, X, QrCode, User as UserIcon,
    FlipHorizontal2
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
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

    // Results
    const [result, setResult] = useState<{ success: boolean; message: string; data?: BoardingCheckinType; user?: User; status?: 'late' | 'on_time' } | null>(null);
    const [recentCheckins, setRecentCheckins] = useState<Array<{ name: string; time: string; type: string; status: string; avatar?: string }>>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configForm, setConfigForm] = useState<BoardingConfig>({
        morning_curfew: '07:00',
        noon_curfew: '12:30',
        evening_curfew: '22:00'
    });

    // NEW: Time Slots State
    const [timeSlots, setTimeSlots] = useState<BoardingTimeSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<BoardingTimeSlot | null>(null);
    const [slotStatus, setSlotStatus] = useState<'on_time' | 'late' | 'closed'>('closed');
    const [systemReady, setSystemReady] = useState(false);

    // HID Scanner Buffer
    const scannerBuffer = useRef<string>('');
    const lastKeyTime = useRef<number>(0);

    // Sync ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // HELPER: Map Slot to CheckinType (Heuristic)
    const getCheckinTypeFromSlot = (slot: BoardingTimeSlot): CheckinType => {
        const name = slot.name.toLowerCase();
        const startH = parseInt(slot.start_time.split(':')[0]);

        if (name.includes('sáng') || (startH >= 4 && startH < 11)) return 'morning_in';
        if (name.includes('trưa') || (startH >= 11 && startH < 14)) return 'noon_in';
        if (name.includes('chiều') || name.includes('tối') || startH >= 14) return 'evening_in';
        return 'morning_in'; // Fallback
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

    const handleAutoCheckin = async (userId: string, name: string, confidence: number) => {
        // BLOCK if closed
        if (!selectedSlot || slotStatus === 'closed') {
            setGuidance('Chưa đến giờ điểm danh!');
            return;
        }

        setIsProcessing(true);
        const nowMs = Date.now(); // Use new variable name to avoid shadowing outer scope if any
        const status = slotStatus === 'closed' ? 'late' : slotStatus;

        // Play Sound
        if (status === 'late') soundService.play('warning');
        else soundService.play('success');

        try {
            // Call API
            const response = await dataService.boardingCheckin(userId, selectedType, status);

            if (response.success && response.data) {
                // Determine ID
                const recordId = response.data.id || userId;

                // Update UI List
                setRecentCheckins(prev => [{
                    id: recordId,
                    name: name,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                    type: getTypeLabel(selectedType),
                    status: status === 'late' ? 'warning' : 'success'
                }, ...prev.slice(0, 9)]);

                // Set Cooldown (SUCCESS = 60s)
                checkinCooldownsRef.current.set(userId, Date.now() + 60000);

                // Show Popup
                setResult({
                    success: true,
                    message: status === 'late' ? 'Check-in Muộn' : 'Check-in Thành công',
                    user: { full_name: name, student_code: '' },
                    status: status
                });

                // Auto close modal
                setTimeout(() => {
                    setResult(null);
                    setIsProcessing(false);
                    stableStartTimeRef.current = null;
                    setStabilityProgress(0);
                }, 3000);
            } else {
                // Error (e.g. already checking)
                soundService.play('error');
                checkinCooldownsRef.current.set(userId, Date.now() + 5000);
                setIsProcessing(false);
            }
        } catch (e) {
            console.error(e);
            soundService.play('error');
            checkinCooldownsRef.current.set(userId, Date.now() + 5000);
            setIsProcessing(false);
        }
    };

    // REF to handleAutoCheckin to avoid stale closures in loop
    const handleAutoCheckinRef = useRef(handleAutoCheckin);
    useEffect(() => { handleAutoCheckinRef.current = handleAutoCheckin; }, [handleAutoCheckin]);



    // AUTO-SELECT Active Slot based on Time
    useEffect(() => {
        if (timeSlots.length === 0) return;

        const checkSlots = () => {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            let foundSlot: BoardingTimeSlot | null = null;
            let status: 'on_time' | 'late' | 'closed' = 'closed';

            for (const slot of timeSlots) {
                if (!slot.is_active) continue;

                const [startH, startM] = slot.start_time.split(':').map(Number);
                const [endH, endM] = slot.end_time.split(':').map(Number);
                const startMins = startH * 60 + startM;
                const endMins = endH * 60 + endM;

                // Check Active Window (Start -> End + 60 mins allowable late)
                if (currentMinutes >= startMins && currentMinutes <= endMins + 60) {
                    foundSlot = slot;
                    status = currentMinutes <= endMins ? 'on_time' : 'late';
                    break;
                }
            }

            if (foundSlot) {
                if (selectedSlot?.id !== foundSlot.id || slotStatus !== status) {
                    setSelectedSlot(foundSlot);
                    setSlotStatus(status);
                    const type = getCheckinTypeFromSlot(foundSlot);
                    setSelectedType(type);
                    console.log(`🔄 Auto-switched to slot: ${foundSlot.name} (${status.toUpperCase()})`);
                }
            } else {
                if (slotStatus !== 'closed') {
                    setSelectedSlot(null);
                    setSlotStatus('closed');
                    console.log('⛔ No active slot -> Closed');
                }
            }
        };

        checkSlots(); // Check immediately
        const interval = setInterval(checkSlots, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, [timeSlots, selectedSlot, slotStatus]);

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

    // Global Keyboard Listener for HID Scanners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is on an input field (search/etc)
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const now = Date.now();

            // Clean buffer if typing is too slow (human typing vs scanner)
            if (now - lastKeyTime.current > 100) {
                scannerBuffer.current = '';
            }
            lastKeyTime.current = now;

            if (e.key === 'Enter') {
                if (scannerBuffer.current.length > 5) { // Minimum length check
                    console.log('Scanner detected:', scannerBuffer.current);
                    handleQRCheckin(scannerBuffer.current);
                    // Switch to QR view if not already
                    if (checkinMode !== 'qr') setCheckinMode('qr');
                }
                scannerBuffer.current = '';
            } else if (e.key.length === 1) {
                // Determine if it's a valid char
                scannerBuffer.current += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [checkinMode]);

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

    // Load Models, Students, and Time Slots
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Load Face Models
                await faceService.loadModels();
                setModelsReady(true);

                // 2. Load Students
                const response = await dataService.getAllStudentsForCheckin(false);
                if (response.success && response.data) {
                    setStudentsData(response.data);
                    faceService.faceMatcher.clearAll();
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

                // 3. Load Time Slots (NEW)
                const slotsRes = await dataService.getActiveTimeSlots();
                if (slotsRes.success && slotsRes.data && slotsRes.data.length > 0) {
                    setTimeSlots(slotsRes.data);

                    // Auto-detect current slot
                    const currentSlot = dataService.getCurrentTimeSlot(slotsRes.data);
                    if (currentSlot) {
                        setSelectedSlot(currentSlot);
                        console.log('✅ Auto-selected time slot:', currentSlot.name);
                    } else {
                        // Don't default to first slot - wait for auto loop or stay closed
                        console.log('⏳ No exact active slot found, waiting for auto-loop check...');
                    }
                } else {
                    console.log('⚠️ No time slots found, using legacy mode');
                }

                setSystemReady(true);
            } catch (err) {
                console.error('Initialization error:', err);
            }
        };
        init();
    }, []);

    // Reusable function to start face camera
    const startFaceCamera = async () => {
        // Stop any existing stream first to avoid conflicts
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
        }
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            console.log('✅ Face camera started');
        } catch (err) {
            console.error('Camera error', err);
        }
    };

    // Stop face camera (to release for QR scanner)
    const stopFaceCamera = () => {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            console.log('🛑 Face camera stopped');
        }
    };

    // Start camera based on mode
    useEffect(() => {
        if (checkinMode === 'face' && modelsReady) {
            // Small delay to ensure QR scanner fully released camera
            const timer = setTimeout(() => {
                startFaceCamera();
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [checkinMode, modelsReady]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // Detect Loop (Optimized + Security)
    useEffect(() => {
        if (!modelsReady || !studentsLoaded || !videoRef.current || !systemReady) return;

        let animationId: number;
        // FAST CHECK-IN: Reduced from 1200ms to 200ms for high volume
        const STABILITY_THRESHOLD = 200;
        const PROCESSING_THROTTLE = 80; // ~12 FPS, good balance

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

                                // Check Cooldown (Map stores EXPIRY timestamp now)
                                const cooldownExpiry = checkinCooldownsRef.current.get(match.userId);
                                // const now = Date.now(); // REMOVED: Use outer 'now'
                                const isCool = !cooldownExpiry || now > cooldownExpiry;

                                if (stableDuration >= STABILITY_THRESHOLD) {
                                    // 7. TRIGGER CHECK-IN
                                    if (isCool && !isProcessingRef.current) {
                                        setGuidance('Đang check-in...');
                                        handleAutoCheckinRef.current(match.userId, match.name, match.confidence);
                                    } else if (!isCool) {
                                        // Distinguish Success vs Error based on remaining time
                                        const remaining = cooldownExpiry! - now;
                                        if (remaining > 10000) {
                                            // Long cooldown -> Success
                                            setGuidance(`Đã check-in rồi (${Math.ceil(remaining / 1000)}s)`);
                                            setStabilityProgress(100);
                                        } else {
                                            // Short cooldown -> Error/Wait
                                            setGuidance(`Vui lòng đợi ${Math.ceil(remaining / 1000)}s...`);
                                            setStabilityProgress(0); // Reset progress so it doesn't look like success
                                        }
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
    }, [modelsReady, studentsLoaded, systemReady]);

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

        // Check cooldown (Expiry Logic)
        const now = Date.now();
        const cooldownExpiry = checkinCooldownsRef.current.get(student.id);
        if (cooldownExpiry && now < cooldownExpiry) {
            const remaining = cooldownExpiry - now;
            if (remaining > 10000) {
                setGuidance(`${student.full_name} đã check-in (${Math.ceil(remaining / 1000)}s)`);
            } else {
                setGuidance(`Vui lòng đợi ${Math.ceil(remaining / 1000)}s...`);
            }
            return;
        }

        // Perform check-in
        await handleAutoCheckin(student.id, student.full_name, 100);
    };

    // Switch mode effect
    const switchCheckinMode = async (mode: 'face' | 'qr', newFacing?: 'environment' | 'user') => {
        // CRITICAL: Stop ALL active scanners first to prevent conflicts
        try {
            await qrScannerService.stopScanner();
            setQrScannerActive(false);
        } catch (e) {
            console.warn('Error stopping QR scanner:', e);
        }

        // Stop face camera if switching to QR
        if (mode === 'qr') {
            stopFaceCamera();
        }

        // Update facing mode if provided
        const facing = newFacing || cameraFacing;
        if (newFacing) {
            setCameraFacing(newFacing);
        }

        setCheckinMode(mode);

        // Start QR scanner if switching to QR mode
        if (mode === 'qr') {
            setGuidance('Đưa mã QR vào khung hình...');
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
                        },
                        facing
                    );
                    setQrScannerActive(true);
                } catch (err) {
                    console.error('Failed to start QR scanner:', err);
                }
            }, 400);
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
            {/* ========== LOADING OVERLAY ========== */}
            {(!modelsReady || !studentsLoaded) && (
                <div className="fixed inset-0 z-[200] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center">
                    <div className="text-center">
                        {/* Animated Logo */}
                        <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse shadow-2xl shadow-indigo-500/30">
                            <UserCheck className="w-12 h-12 text-white" />
                        </div>

                        <h2 className="text-3xl font-black text-white mb-4">Đang khởi tạo hệ thống</h2>
                        <p className="text-slate-400 text-lg mb-10 max-w-md mx-auto">Vui lòng chờ trong giây lát để đảm bảo hệ thống check-in hoạt động chính xác.</p>

                        {/* Loading Steps */}
                        <div className="space-y-4 max-w-sm mx-auto text-left">
                            {/* Step 1: AI Models */}
                            <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl ${modelsReady ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/10 border border-white/10'}`}>
                                {modelsReady ? (
                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-6 h-6 text-white" />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 bg-indigo-500/50 rounded-xl flex items-center justify-center flex-shrink-0 animate-spin">
                                        <RefreshCw className="w-6 h-6 text-white" />
                                    </div>
                                )}
                                <div>
                                    <p className={`font-bold ${modelsReady ? 'text-emerald-400' : 'text-white'}`}>Mô hình AI nhận diện</p>
                                    <p className={`text-sm ${modelsReady ? 'text-emerald-400/70' : 'text-slate-400'}`}>{modelsReady ? 'Đã sẵn sàng' : 'Đang tải...'}</p>
                                </div>
                            </div>

                            {/* Step 2: Student Data */}
                            <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl ${studentsLoaded ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/10 border border-white/10'}`}>
                                {studentsLoaded ? (
                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-6 h-6 text-white" />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 bg-indigo-500/50 rounded-xl flex items-center justify-center flex-shrink-0 animate-spin">
                                        <RefreshCw className="w-6 h-6 text-white" />
                                    </div>
                                )}
                                <div>
                                    <p className={`font-bold ${studentsLoaded ? 'text-emerald-400' : 'text-white'}`}>Dữ liệu học sinh ({studentsData.length})</p>
                                    <p className={`text-sm ${studentsLoaded ? 'text-emerald-400/70' : 'text-slate-400'}`}>{studentsLoaded ? 'Đã sẵn sàng' : 'Đang đồng bộ khuôn mặt...'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                {/* Status Indicator - Góc trên trái */}
                <div className="absolute top-4 left-4 z-30">
                    <div className={`px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 backdrop-blur-md shadow-lg ${checkinMode === 'face'
                        ? 'bg-indigo-600/90 text-white border border-indigo-400/30'
                        : 'bg-emerald-600/90 text-white border border-emerald-400/30'
                        }`}>
                        {checkinMode === 'face' ? (
                            <>
                                <UserIcon className="w-4 h-4" />
                                Xác thực Gương mặt
                            </>
                        ) : (
                            <>
                                <QrCode className="w-4 h-4" />
                                Quét mã QR
                            </>
                        )}
                    </div>
                </div>

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

                {/* Camera Flip Button - Chỉ hiển thị khi ở QR mode */}
                {checkinMode === 'qr' && (
                    <button
                        onClick={() => {
                            const newFacing = cameraFacing === 'environment' ? 'user' : 'environment';
                            switchCheckinMode('qr', newFacing);
                        }}
                        className="absolute bottom-4 right-4 z-30 p-3 bg-slate-800/80 backdrop-blur-md rounded-full text-white hover:bg-slate-700 transition-all shadow-lg border border-white/10 pointer-events-auto"
                        title={cameraFacing === 'environment' ? 'Chuyển camera trước' : 'Chuyển camera sau'}
                    >
                        <FlipHorizontal2 className="w-5 h-5" />
                    </button>
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
                                {detectedPerson.name} ({stabilityProgress >= 100 ? 'Đã check-in' : `${Math.round(stabilityProgress)}%`})
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
                {/* Auto Status Display - REPLACES Manual Selector */}
                <div className={`p-5 rounded-3xl border shadow-xl transition-all duration-500 ${selectedSlot
                    ? (slotStatus === 'on_time'
                        ? 'bg-emerald-900/40 border-emerald-500/30'
                        : 'bg-amber-900/40 border-amber-500/30')
                    : 'bg-slate-800/50 border-white/10'
                    }`}>

                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-white/80 font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
                            <Clock className="w-4 h-4 text-indigo-400" />
                            Trạng thái hiện tại
                        </h3>
                        {/* System Ready Indicator */}
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${systemReady
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}>
                            <div className={`w-2 h-2 rounded-full ${systemReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                            {systemReady ? 'Sẵn sàng' : 'Đang tải...'}
                        </div>
                    </div>

                    {selectedSlot ? (
                        <div className="space-y-4">
                            {/* Active Slot Name */}
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold mb-1">Khung giờ đang mở</p>
                                <h2 className="text-2xl font-black text-white">{selectedSlot.name}</h2>
                                <p className="text-white/60 text-sm flex items-center gap-2 mt-1">
                                    <Clock className="w-3 h-3" />
                                    {selectedSlot.start_time} - {selectedSlot.end_time}
                                </p>
                            </div>

                            {/* Status Badge */}
                            <div className={`px-4 py-3 rounded-xl border flex items-center gap-3 ${slotStatus === 'on_time'
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                : 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                }`}>
                                {slotStatus === 'on_time' ? (
                                    <div className="bg-emerald-500 text-slate-900 p-2 rounded-lg">
                                        <CheckCircle className="w-5 h-5" />
                                    </div>
                                ) : (
                                    <div className="bg-amber-500 text-slate-900 p-2 rounded-lg">
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                )}
                                <div>
                                    <p className="font-bold text-lg leading-tight">
                                        {slotStatus === 'on_time' ? 'Đúng Giờ' : 'Đi Muộn'}
                                    </p>
                                    <p className="text-xs opacity-80">
                                        {slotStatus === 'on_time' ? 'Check-in hợp lệ' : 'Sẽ bị trừ điểm'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-600">
                                <Moon className="w-8 h-8" />
                            </div>
                            <h3 className="text-white font-bold text-lg">Chưa đến giờ điểm danh</h3>
                            <p className="text-slate-400 text-sm mt-1">Vui lòng quay lại vào khung giờ tiếp theo</p>
                        </div>
                    )}
                </div>


                {/* Recent Use */}
                < div className="flex-1 bg-slate-800/50 backdrop-blur-md p-5 rounded-3xl border border-white/10 shadow-xl overflow-hidden flex flex-col" >
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
                </div >
            </div >

            {/* Success Popup */}
            {
                result && result.success && (
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
                )
            }

            {/* Config Modal */}
            {
                showConfigModal && (
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
                )
            }
        </div >
    );
};

export default BoardingCheckin;

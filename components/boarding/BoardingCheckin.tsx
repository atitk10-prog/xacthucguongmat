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
    FlipHorizontal2, Loader2
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
    const [showRecentSheet, setShowRecentSheet] = useState(false);

    // HID Scanner Buffer
    const scannerBuffer = useRef<string>('');
    const lastKeyTime = useRef<number>(0);

    // Sync ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // HELPER: Map Slot to CheckinType (Heuristic)
    const getCheckinTypeFromSlot = (slot: BoardingTimeSlot): CheckinType => {
        const name = slot.name.toLowerCase();
        const startH = parseInt(slot.start_time.split(':')[0]);

        // Prioritize by Name
        if (name.includes('sáng')) return 'morning_in';
        if (name.includes('trưa')) return 'noon_in';
        if (name.includes('chiều')) return 'afternoon_in';
        if (name.includes('tối')) return 'evening_in';

        // Fallback by Time Range
        if (startH >= 4 && startH < 11) return 'morning_in';
        if (startH >= 11 && startH < 14) return 'noon_in';
        if (startH >= 14 && startH < 17) return 'afternoon_in';
        if (startH >= 17 || startH < 4) return 'evening_in';

        return 'morning_in'; // Absolute fallback
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'morning_in': return 'Sáng - Vào Lớp';
            case 'morning_out': return 'Sáng - Ra Về';
            case 'noon_in': return 'Trưa - Vào';
            case 'noon_out': return 'Trưa - Ra';
            case 'afternoon_in': return 'Chiều - Vào';
            case 'afternoon_out': return 'Chiều - Ra';
            case 'evening_in': return 'Tối - Điểm danh';
            case 'evening_out': return 'Tối - Ra';
            default: return type;
        }
    };

    const renderTypeIcon = (type: string) => {
        if (type.includes('morning')) return <Sunrise className="w-5 h-5" />;
        if (type.includes('noon')) return <Sun className="w-5 h-5" />;
        if (type.includes('afternoon')) return <Sunset className="w-5 h-5" />;
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
            const response = await dataService.boardingCheckin(userId, selectedSlot.id, status as 'on_time' | 'late');

            if (response.success && response.data) {
                // Determine ID
                const recordId = response.data.id || userId;

                // Update UI List
                setRecentCheckins(prev => [{
                    name: name,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                    type: selectedSlot.name,
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
        dataService.syncOfflineData();
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
                                const descriptor = faceService.stringToDescriptor(user.face_descriptor);
                                if (descriptor.length > 0) {
                                    faceService.faceMatcher.registerFace(user.id, descriptor, user.full_name);
                                    count++;
                                }
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
        const PROCESSING_THROTTLE = 60; // 16 FPS

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
                animationId = requestAnimationFrame(loop);
                return;
            }

            // 1. Block if processing a check-in
            if (isProcessingRef.current) {
                setGuidance('Đang xử lý...');
                setStabilityProgress(0);
                setTimeout(() => { animationId = requestAnimationFrame(loop); }, 150);
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
                // 3. Detect Face (Optimized)
                const detections = await faceService.detectFaces(videoRef.current, true);
                const primaryDetection = detections.length > 0 ? detections[0] : null;

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
        <div className="fixed inset-0 bg-black overflow-hidden font-sans select-none">
            {/* ========== LOADING OVERLAY ========== */}
            {(!modelsReady || !studentsLoaded) && (
                <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-center p-6">
                    <div className="text-center max-w-sm">
                        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse shadow-2xl shadow-indigo-500/30">
                            <UserCheck className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-3">Đang khởi tạo AI</h2>
                        <p className="text-slate-400 text-sm mb-8">Hệ thống đang tải dữ liệu khuôn mặt và cấu hình nề nếp...</p>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 animate-progress origin-left"></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== FULLSCREEN BACKGROUND (CAMERA) ========== */}
            <div className="absolute inset-0 z-0">
                {checkinMode === 'face' ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                    />
                ) : (
                    <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
                        <div id="qr-reader" className="w-full h-full max-w-lg aspect-square"></div>
                        {!qrScannerActive && (
                            <div className="flex flex-col items-center gap-4">
                                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                                <p className="text-slate-400">Đang khởi động camera...</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Overlays for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60 pointer-events-none"></div>

                {/* Scanner Line Effect */}
                {checkinMode === 'face' && stream && !isProcessing && (
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-indigo-400/50 shadow-[0_0_20px_rgba(129,140,248,0.8)] z-10 animate-scanline"></div>
                )}
            </div>

            {/* ========== GLASS HEADER ========== */}
            <div className="absolute top-0 left-0 right-0 z-50 flex flex-col pt-safe px-4 pb-4">
                <div className="flex items-center justify-between h-16">
                    {/* Back & Title */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="w-10 h-10 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-xl text-white border border-white/10 active:scale-95 transition-all"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="hidden sm:block">
                            <h1 className="text-lg font-black text-white leading-none">EduCheck Nội Trú</h1>
                            <p className="text-[10px] text-indigo-300 uppercase tracking-widest mt-1">Live Intelligence</p>
                        </div>
                    </div>

                    {/* Mode Toggles */}
                    <div className="flex items-center bg-black/40 backdrop-blur-md rounded-2xl p-1 border border-white/10">
                        <button
                            onClick={() => switchCheckinMode('face')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${checkinMode === 'face' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}
                        >
                            <UserIcon className="w-4 h-4" />
                            <span className="hidden xs:inline">Mặt</span>
                        </button>
                        <button
                            onClick={() => switchCheckinMode('qr')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${checkinMode === 'qr' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}
                        >
                            <QrCode className="w-4 h-4" />
                            <span className="hidden xs:inline">QR</span>
                        </button>
                    </div>

                    {/* Settings/Clock */}
                    <div className="flex items-center gap-3">
                        <div className="hidden lg:flex flex-col items-end mr-2">
                            <p className="text-white font-mono text-sm">{new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                            <p className="text-[10px] text-red-400 font-black animate-pulse uppercase">Live Recording</p>
                        </div>
                        <button
                            onClick={() => setShowConfigModal(true)}
                            className="w-10 h-10 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-xl text-white border border-white/10 active:scale-95 transition-all"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Sub-header for Slot Info */}
                {selectedSlot && (
                    <div className="mt-2 flex self-center">
                        <div className={`px-4 py-1.5 rounded-full backdrop-blur-md border flex items-center gap-2 animate-in slide-in-from-top-4 duration-500 ${slotStatus === 'on_time' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/20 border-amber-500/30 text-amber-400'}`}>
                            <div className={`w-2 h-2 rounded-full ${slotStatus === 'on_time' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>
                            <span className="text-xs font-black uppercase tracking-wider">{selectedSlot.name}: {slotStatus === 'on_time' ? 'Đúng giờ' : 'Đã muộn'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ========== SCANNING OVERLAY (FRAME) ========== */}
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="relative w-[80vw] sm:w-80 h-[100vw] sm:h-96">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white/40 rounded-tl-3xl"></div>
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white/40 rounded-tr-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white/40 rounded-bl-3xl"></div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white/40 rounded-br-3xl"></div>

                    {/* Scanning Box */}
                    <div className={`absolute inset-0 border-2 rounded-3xl transition-all duration-500 ${isProcessing ? 'border-indigo-400 bg-indigo-500/10' : faceDetected ? stabilityProgress >= 100 ? 'border-emerald-400 shadow-[0_0_50px_rgba(52,211,153,0.3)] bg-emerald-500/10' : 'border-indigo-500' : 'border-white/10'}`}>
                        {/* Detection Indicators */}
                        {isProcessing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-12 h-12 text-white animate-spin" />
                                <span className="text-xs font-black text-white uppercase tracking-widest bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">Verifying AI...</span>
                            </div>
                        )}
                        {!isProcessing && faceDetected && stabilityProgress > 0 && stabilityProgress < 100 && (
                            <div className="absolute inset-0 overflow-hidden rounded-3xl">
                                <div
                                    className="absolute bottom-0 left-0 right-0 bg-indigo-500/30 transition-all duration-300"
                                    style={{ height: `${stabilityProgress}%` }}
                                ></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-3xl font-black text-white drop-shadow-lg">{Math.round(stabilityProgress)}%</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ========== FLOATING GUIDANCE & CONTROLS ========== */}
            <div className="absolute bottom-12 left-0 right-0 z-40 flex flex-col items-center gap-6 px-6">
                {/* Guidance Bubble */}
                <div className={`px-6 py-3 rounded-2xl backdrop-blur-xl border-2 flex items-center gap-3 shadow-2xl transition-all duration-300 ${!faceDetected ? 'bg-black/60 border-white/10' : 'bg-indigo-600/80 border-indigo-400/50 scale-105'}`}>
                    {!faceDetected ? (
                        <div className="p-2 bg-white/10 rounded-xl">
                            {checkinMode === 'face' ? <UserIcon className="w-5 h-5 text-white" /> : <QrCode className="w-5 h-5 text-white" />}
                        </div>
                    ) : (
                        <div className="p-2 bg-white rounded-xl animate-bounce">
                            <UserCheck className="w-5 h-5 text-indigo-600" />
                        </div>
                    )}
                    <span className="text-white font-black text-sm sm:text-lg uppercase tracking-wide">
                        {isProcessing ? 'Đang xác thực...' : guidance}
                    </span>
                </div>

                {/* Bottom Main Controls */}
                <div className="flex items-center gap-4 w-full max-w-sm">
                    {/* View Recent Results Button (Mobile Focus) */}
                    <button
                        onClick={() => setShowRecentSheet(true)}
                        className="flex-1 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white rounded-2xl h-14 font-black text-sm flex items-center justify-center gap-3 border border-white/20 shadow-xl transition-all active:scale-95"
                    >
                        <History className="w-5 h-5 text-emerald-400" />
                        <span>XEM DANH SÁCH ({recentCheckins.length})</span>
                    </button>

                    {/* QR Toggle / Camera Flip Floating */}
                    {checkinMode === 'qr' && (
                        <button
                            onClick={() => {
                                const newFacing = cameraFacing === 'environment' ? 'user' : 'environment';
                                switchCheckinMode('qr', newFacing);
                            }}
                            className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl active:rotate-180 transition-all duration-500"
                        >
                            <FlipHorizontal2 className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </div>

            {/* ========== BOTTOM SHEET / RECENT LIST MODAL ========== */}
            {showRecentSheet && (
                <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRecentSheet(false)}></div>
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 rounded-t-[3rem] max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-500">
                        {/* Handler Line */}
                        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto my-4"></div>

                        <div className="px-6 pb-6 flex items-center justify-between">
                            <h3 className="text-xl font-black text-white flex items-center gap-2">
                                <History className="w-6 h-6 text-emerald-400" />
                                Lịch sử vừa điểm danh
                            </h3>
                            <button onClick={() => setShowRecentSheet(false)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-20 space-y-3 custom-scrollbar">
                            {recentCheckins.length === 0 ? (
                                <div className="text-center py-20 text-slate-500 flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                                        <History className="w-10 h-10 opacity-20" />
                                    </div>
                                    <p className="font-bold">Chưa có ai check-in trong phiên này</p>
                                </div>
                            ) : (
                                recentCheckins.map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-3xl animate-in fade-in zoom-in-95" style={{ animationDelay: `${i * 50}ms` }}>
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white shadow-lg">
                                            {item.name.charAt(0)}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-white text-lg">{item.name}</p>
                                            <div className="flex items-center gap-2 text-indigo-300 text-xs mt-1">
                                                <span className="font-mono bg-white/10 px-2 py-0.5 rounded-lg">{item.time}</span>
                                                <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                                                <span>{item.type}</span>
                                            </div>
                                        </div>
                                        <div className={`p-2 rounded-xl bg-opacity-20 ${item.status === 'warning' ? 'bg-amber-400 text-amber-400' : 'bg-emerald-400 text-emerald-400'}`}>
                                            {item.status === 'warning' ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Config Modal */}
            {showConfigModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-full max-w-md relative shadow-2xl animate-scale-in">
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
                        <p className="text-slate-400 text-sm mb-6">Điều chỉnh thời gian giới nghiêm.</p>

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

            {/* Custom Styles */}
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
                .xs\\:inline { display: none; }
                @media (min-width: 400px) { .xs\\:inline { display: inline; } }
            ` }} />
        </div>
    );
};

export default BoardingCheckin;

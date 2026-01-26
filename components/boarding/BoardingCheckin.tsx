import React, { useState, useRef, useEffect } from 'react';
import { dataService, CheckinType } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
function getTodayDateStr() { return new Date().toLocaleDateString('en-CA'); }
import { faceService } from '../../services/faceService';
import { soundService } from '../../services/soundService';
import { qrScannerService } from '../../services/qrScannerService';
import { User, BoardingCheckin as BoardingCheckinType, BoardingConfig, BoardingTimeSlot } from '../../types';
import {
    Camera, RefreshCw, UserCheck, AlertTriangle, CheckCircle,
    ArrowDown, ArrowUp, Clock, History, ChevronLeft, MapPin,
    Moon, Sun, Sunrise, Sunset, Settings, Save, X, QrCode, User as UserIcon, Users,
    FlipHorizontal2, RotateCcw, CameraOff, Maximize2, Search, Filter
} from 'lucide-react';
import { Room } from '../../types';

interface BoardingCheckinProps {
    currentUser?: User;
    onBack?: () => void;
}

const BoardingCheckin: React.FC<BoardingCheckinProps> = ({ onBack }) => {
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const checkinCooldownsRef = useRef<Map<string, number>>(new Map());
    const stableStartTimeRef = useRef<number | null>(null);
    const lastProcessedTimeRef = useRef<number>(0);
    const recognizedPersonRef = useRef<{ id: string; name: string; confidence: number } | null>(null);
    const isProcessingRef = useRef(false);
    const isDetectingRef = useRef(false);
    const lastMatchingTimeRef = useRef<number>(0);

    // State
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedType, setSelectedType] = useState<CheckinType>('morning_in');
    const [modelsReady, setModelsReady] = useState(false);
    const [studentsLoaded, setStudentsLoaded] = useState(false);
    const [faceDetected, setFaceDetected] = useState(false);
    const [detectedPerson, setDetectedPerson] = useState<{ name: string; confidence: number } | null>(null);
    const [guidance, setGuidance] = useState<string>('Đang tìm khuôn mặt...');
    const [stabilityProgress, setStabilityProgress] = useState(0);
    const [faceBox, setFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [isCloseEnough, setIsCloseEnough] = useState(false);
    const [multipleFaces, setMultipleFaces] = useState(false);

    // QR Check-in Mode
    const [checkinMode, setCheckinMode] = useState<'face' | 'qr'>('face');
    const [studentsData, setStudentsData] = useState<User[]>([]);
    const [qrScannerActive, setQrScannerActive] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

    // Results & Config
    const [result, setResult] = useState<{ success: boolean; message: string; data?: BoardingCheckinType; user?: User; status?: 'late' | 'on_time'; points?: number } | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [recentCheckins, setRecentCheckins] = useState<Array<{ name: string; time: string; type: string; status: string; image?: string; userId?: string }>>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configForm, setConfigForm] = useState<BoardingConfig>({
        morning_curfew: '07:00',
        noon_curfew: '12:30',
        evening_curfew: '22:00'
    });
    const [boardingConfig, setBoardingConfig] = useState<BoardingConfig>(configForm);

    // Time Slots
    const [timeSlots, setTimeSlots] = useState<BoardingTimeSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<BoardingTimeSlot | null>(null);
    const [slotStatus, setSlotStatus] = useState<'on_time' | 'late' | 'closed'>('closed');
    const [systemReady, setSystemReady] = useState(false);

    // Mobile View Toggle
    const [showMobileHistory, setShowMobileHistory] = useState(false);

    // Attendee Modal state
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent'>('all');
    const [rooms, setRooms] = useState<Room[]>([]);

    // Network & Sync status
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isLowLight, setIsLowLight] = useState(false);

    // HID Scanner Buffer
    const scannerBuffer = useRef<string>('');
    const lastKeyTime = useRef<number>(0);

    // Sync processing ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // Helpers
    const getCheckinTypeFromSlot = (slot: BoardingTimeSlot): CheckinType => {
        const name = slot.name.toLowerCase();
        const startH = parseInt(slot.start_time.split(':')[0]);
        if (name.includes('sáng')) return 'morning_in';
        if (name.includes('trưa')) return 'noon_in';
        if (name.includes('chiều')) return 'afternoon_in';
        if (name.includes('tối')) return 'evening_in';
        if (startH >= 4 && startH < 11) return 'morning_in';
        if (startH >= 11 && startH < 14) return 'noon_in';
        if (startH >= 14 && startH < 17) return 'afternoon_in';
        return 'evening_in';
    };

    const addUniqueCheckin = (entry: { name: string; userId?: string; time: string; type: string; status: string; image?: string }) => {
        setRecentCheckins(prev => {
            const isDuplicate = prev.some(item =>
                (item.userId && entry.userId && item.userId === entry.userId && item.type === entry.type) ||
                (item.name === entry.name && item.time === entry.time)
            );
            if (isDuplicate) return prev;
            // Limit to 10 people as requested
            return [entry, ...prev.slice(0, 9)];
        });

        // Update checkedInIds Set
        if (entry.userId) {
            setCheckedInIds(prev => {
                const next = new Set(prev);
                next.add(entry.userId!);
                return next;
            });
        }
    };

    const handleAutoCheckin = async (userId: string, name: string, confidence: number) => {
        if (!selectedSlot || slotStatus === 'closed') {
            setGuidance('Chưa đến giờ điểm danh!');
            return;
        }
        setIsProcessing(true);
        const status = slotStatus === 'closed' ? 'late' : slotStatus;
        if (status === 'late') soundService.play('warning'); else soundService.play('success');

        try {
            const response = await dataService.boardingCheckin(userId, selectedSlot.id, status as 'on_time' | 'late');
            if (response.success) {
                const student = studentsData.find(s => s.id === userId);
                checkinCooldownsRef.current.set(userId, Date.now() + 60000);

                // Track checked in ID
                setCheckedInIds(prev => {
                    const next = new Set(prev);
                    next.add(userId);
                    return next;
                });

                if (response.alreadyExists) {
                    setResult({ success: true, message: 'Bạn đã điểm danh rồi', user: { full_name: name, student_code: '' }, status: 'on_time' });
                } else {
                    addUniqueCheckin({
                        name: name,
                        userId: userId,
                        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                        type: selectedSlot.name,
                        image: student?.avatar_url,
                        status: status === 'late' ? 'warning' : 'success'
                    });
                    // Get points from response if available
                    const points = response.data?.points_earned ?? null;
                    setResult({
                        success: true,
                        message: status === 'late' ? 'Check-in Muộn' : 'Check-in Thành công',
                        user: { full_name: name, student_code: '' },
                        status: status,
                        points: points
                    });
                }

                setTimeout(() => { setResult(null); setIsProcessing(false); stableStartTimeRef.current = null; setStabilityProgress(0); }, 3000);
            } else {
                soundService.play('error');
                checkinCooldownsRef.current.set(userId, Date.now() + 5000);
                setIsProcessing(false);
            }
        } catch (e) {
            soundService.play('error');
            checkinCooldownsRef.current.set(userId, Date.now() + 5000);
            setIsProcessing(false);
        }
    };

    const handleQRCheckin = async (studentCode: string) => {
        if (isProcessingRef.current) return;
        const student = studentsData.find(s => s.student_code === studentCode || s.id === studentCode);
        if (!student) {
            setGuidance(`Không tìm thấy học sinh: ${studentCode}`);
            soundService.play('error');
            return;
        }
        const now = Date.now();
        const cooldownExpiry = checkinCooldownsRef.current.get(student.id);
        if (cooldownExpiry && now < cooldownExpiry) {
            const remaining = cooldownExpiry - now;
            setGuidance(remaining > 10000 ? `${student.full_name} đã check-in (${Math.ceil(remaining / 1000)}s)` : `Vui lòng đợi ${Math.ceil(remaining / 1000)}s...`);
            return;
        }
        await handleAutoCheckin(student.id, student.full_name, 100);
    };

    const switchCheckinMode = async (mode: 'face' | 'qr', newFacing?: 'environment' | 'user') => {
        // STEP 1: Stop ALL active cameras/scanners first
        try {
            await qrScannerService.stopScanner();
            setQrScannerActive(false);
        } catch (e) { console.warn('QR stop error:', e); }

        stopFaceCamera();

        const facing = newFacing || cameraFacing;
        if (newFacing) setCameraFacing(newFacing);
        setCheckinMode(mode);

        // RESET TRACKING STATE TO PREVENT STALL/GLITCH
        setIsProcessing(false);
        setStabilityProgress(0);
        setFaceDetected(false);
        setDetectedPerson(null);
        recognizedPersonRef.current = null;
        stableStartTimeRef.current = null;

        // STEP 2: Wait longer for camera to fully release
        await new Promise(resolve => setTimeout(resolve, 600));

        // STEP 3: Start the appropriate scanner
        if (mode === 'qr') {
            setGuidance('Đang mở camera QR...');
            try {
                await qrScannerService.startScanning(
                    'qr-reader',
                    (res) => { if (res.code) handleQRCheckin(res.code); },
                    (err) => { setGuidance('Lỗi camera: ' + err); setCameraError(err); },
                    facing
                );
                setQrScannerActive(true);
                setCameraError(null);
                setGuidance('Đưa mã QR vào khung hình...');
            } catch (err) {
                console.error('QR scanner failed:', err);
                setGuidance('Không thể mở camera QR. Thử lại...');
                setCameraError('Thất bại khi khởi động camera QR.');
            }
        } else {
            setGuidance(modelsReady && studentsLoaded ? 'Đang tìm khuôn mặt...' : 'Đang khởi động AI...');
            setCameraError(null);
            // startFaceCamera will be triggered by useEffect
        }
    };

    const startFaceCamera = async () => {
        // Cleanup existing stream first
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
        }

        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            setStream(s);
            if (videoRef.current) {
                videoRef.current.srcObject = s;
                await videoRef.current.play();
            }
            setCameraError(null);
            setGuidance(modelsReady && studentsLoaded ? 'Đang tìm khuôn mặt...' : 'Đang khởi động AI...');
        } catch (e) {
            console.error('Face camera failed:', e);
            setCameraError('Không thể mở camera. Kiểm tra quyền truy cập.');
            setGuidance('Lỗi camera.');
        }
    };

    const stopFaceCamera = () => {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
            if (videoRef.current) videoRef.current.srcObject = null;
        }
    };

    const handleRetryCamera = () => {
        setCameraError(null);
        if (checkinMode === 'face') {
            startFaceCamera();
        } else {
            switchCheckinMode('qr');
        }
    };

    const handleSaveConfig = async () => {
        const res = await dataService.updateBoardingConfig(configForm);
        if (res.success) { setBoardingConfig(configForm); setShowConfigModal(false); alert('Thành công!'); } else alert('Lỗi: ' + res.error);
    };

    // Initial Load
    useEffect(() => {
        const init = async () => {
            try {
                await faceService.loadModels(); setModelsReady(true);
                const studentsRes = await dataService.getAllStudentsForCheckin(false);
                if (studentsRes.success && studentsRes.data) {
                    setStudentsData(studentsRes.data);

                    // NEW: Optimized loading of descriptors
                    setGuidance('Đang tải dữ liệu Face ID...');
                    const userIds = studentsRes.data.map(u => u.id);
                    const descriptorRes = await dataService.getFaceDescriptors(userIds);

                    faceService.faceMatcher.clearAll();
                    if (descriptorRes.success && descriptorRes.data) {
                        const descriptors = descriptorRes.data;
                        studentsRes.data.forEach(u => {
                            const descStr = descriptors[u.id];
                            if (descStr) {
                                try {
                                    faceService.faceMatcher.registerFace(u.id, faceService.stringToDescriptor(descStr), u.full_name);
                                } catch (e) { }
                            }
                        });
                    }
                    setStudentsLoaded(true);
                }
                const slotsRes = await dataService.getActiveTimeSlots();
                if (slotsRes.success && slotsRes.data) setTimeSlots(slotsRes.data);
                const configRes = await dataService.getBoardingConfig();
                if (configRes.success && configRes.data) { setBoardingConfig(configRes.data); setConfigForm(configRes.data); }
                const roomsRes = await dataService.getRooms();
                if (roomsRes.success && roomsRes.data) setRooms(roomsRes.data);

                // LOAD RECENT CHECK-INS (LIMIT 10)
                const recentRes = await dataService.getRecentBoardingLogs(10);
                if (recentRes.success && recentRes.data) {
                    const mapped = recentRes.data.map(c => ({
                        name: c.user?.full_name || 'Học sinh',
                        userId: c.user_id,
                        time: new Date(c.checkin_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                        type: c.slot?.name || 'Điểm danh',
                        image: c.user?.avatar_url,
                        status: c.status === 'late' ? 'warning' : 'success'
                    }));
                    setRecentCheckins(mapped);

                    // Sync checkedInIds
                    const ids = new Set<string>();
                    recentRes.data.forEach(c => ids.add(c.user_id));
                    setCheckedInIds(ids);
                }

                // Set initial queue count
                setPendingSyncCount(dataService.getOfflineQueueLength());

                setSystemReady(true);
                dataService.syncOfflineData();
            } catch (e) { }
        };
        init();

        // Network listeners
        const handleOnline = () => {
            setIsOnline(true);
            // Trigger sync when back online
            dataService.syncOfflineData().then(() => {
                setPendingSyncCount(dataService.getOfflineQueueLength());
            });
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Sync count checker interval
        const syncInterval = setInterval(() => {
            const count = dataService.getOfflineQueueLength();
            if (count !== pendingSyncCount) setPendingSyncCount(count);
        }, 3000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(syncInterval);
        };
    }, []);

    // Realtime Sync Subscription
    useEffect(() => {
        if (!selectedSlot || !systemReady) return;

        const channel = supabase
            .channel(`boarding_sync:${selectedSlot.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'boarding_attendance',
                    filter: `slot_id=eq.${selectedSlot.id}`
                },
                async (payload) => {
                    const newLog = payload.new as any;
                    if (newLog.date !== getTodayDateStr()) return;

                    // Match user for info
                    const student = studentsData.find(s => s.id === newLog.user_id);
                    if (student) {
                        addUniqueCheckin({
                            name: student.full_name,
                            userId: student.id,
                            time: new Date(newLog.checkin_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                            type: selectedSlot.name,
                            image: student.avatar_url,
                            status: newLog.status === 'late' ? 'warning' : 'success'
                        });
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedSlot?.id, systemReady, studentsData]);

    // Slot Management Loop
    useEffect(() => {
        if (timeSlots.length === 0) return;
        const check = () => {
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            let found: BoardingTimeSlot | null = null, status: 'on_time' | 'late' | 'closed' = 'closed';
            for (const s of timeSlots) {
                if (!s.is_active) continue;
                const [sh, sm] = s.start_time.split(':').map(Number);
                const [eh, em] = s.end_time.split(':').map(Number);
                const start = sh * 60 + sm, end = eh * 60 + em;
                if (nowMins >= start && nowMins <= end + 60) {
                    found = s; status = nowMins <= end ? 'on_time' : 'late'; break;
                }
            }
            if (found && (selectedSlot?.id !== found.id || slotStatus !== status)) {
                setSelectedSlot(found); setSlotStatus(status); setSelectedType(getCheckinTypeFromSlot(found));

                // Fetch recent check-ins for this slot
                dataService.getRecentBoardingActivity({
                    date: new Date().toLocaleDateString('en-CA'),
                    slotId: found.id,
                    limit: 10
                }).then(res => {
                    if (res.success && res.data) {
                        const newCheckedInIds = new Set<string>();
                        setRecentCheckins(res.data.map(item => {
                            if (item.user_id) newCheckedInIds.add(item.user_id);
                            return {
                                name: item.name,
                                userId: item.user_id,
                                time: new Date(item.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                                type: item.slot_name || found.name,
                                image: item.avatar,
                                status: item.status === 'late' ? 'warning' : 'success'
                            };
                        }));
                        setCheckedInIds(newCheckedInIds);
                    }
                });
            } else if (!found && slotStatus !== 'closed') {
                setSelectedSlot(null); setSlotStatus('closed');
            }
        };
        check(); const interval = setInterval(check, 10000);
        return () => clearInterval(interval);
    }, [timeSlots, selectedSlot, slotStatus]);

    // Camera Start useEffect
    useEffect(() => {
        if (checkinMode === 'face' && modelsReady) {
            const t = setTimeout(startFaceCamera, 200);
            return () => clearTimeout(t);
        }
    }, [checkinMode, modelsReady]);

    // Keyboard Listener
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            const now = Date.now();
            if (now - lastKeyTime.current > 100) scannerBuffer.current = '';
            lastKeyTime.current = now;
            if (e.key === 'Enter') {
                if (scannerBuffer.current.length > 5) { handleQRCheckin(scannerBuffer.current); if (checkinMode !== 'qr') setCheckinMode('qr'); }
                scannerBuffer.current = '';
            } else if (e.key.length === 1) scannerBuffer.current += e.key;
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [checkinMode, studentsData]);

    // Detection Loop
    useEffect(() => {
        if (!modelsReady || !studentsLoaded || !videoRef.current || !systemReady) return;
        let aid: number;

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || isProcessingRef.current || isDetectingRef.current) {
                if (isProcessingRef.current) { setGuidance('Đang xử lý...'); setStabilityProgress(0); }
                aid = requestAnimationFrame(() => setTimeout(loop, 200)); return;
            }
            const now = Date.now();
            const throttleTime = (isOnline) ? 80 : 120;
            if (now - lastProcessedTimeRef.current < throttleTime) { aid = requestAnimationFrame(loop); return; }

            isDetectingRef.current = true;
            lastProcessedTimeRef.current = now;
            try {
                const dets = await faceService.detectFaces(videoRef.current, true);

                // Track all faces but pick the primary (largest) for check-in
                let primaryDet = null;
                if (dets.length > 0) {
                    primaryDet = [...dets].sort((a, b) =>
                        (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height)
                    )[0];
                }

                setMultipleFaces(dets.length > 1);

                if (primaryDet && primaryDet.detection) {
                    const box = primaryDet.detection.box;
                    const videoEl = videoRef.current;
                    const displayWidth = videoEl.clientWidth;
                    const displayHeight = videoEl.clientHeight;
                    const originalWidth = videoEl.videoWidth;
                    const originalHeight = videoEl.videoHeight;

                    const scaleX = displayWidth / originalWidth;
                    const scaleY = displayHeight / originalHeight;

                    const scaledWidth = box.width * scaleX;
                    const scaledHeight = box.height * scaleY;
                    const mirroredX = displayWidth - (box.x * scaleX) - scaledWidth;

                    setFaceBox({
                        x: mirroredX,
                        y: box.y * scaleY,
                        width: scaledWidth,
                        height: scaledHeight
                    });

                    const ratio = box.width / originalWidth;
                    const sufficientSize = ratio >= 0.25;
                    setIsCloseEnough(sufficientSize);

                    if (!sufficientSize) {
                        setGuidance('Vui lòng lại gần hơn');
                        setStabilityProgress(0);
                        stableStartTimeRef.current = null;
                        setFaceDetected(false);
                        setDetectedPerson(null);
                    } else {
                        setFaceDetected(true);

                        // THROTTLE Matching: Don't match every single frame, only every 100ms
                        if (now - lastMatchingTimeRef.current > 100) {
                            lastMatchingTimeRef.current = now;
                            const m = faceService.faceMatcher.findMatch(primaryDet.descriptor, 45);
                            if (m) {
                                if (recognizedPersonRef.current?.id === m.userId) {
                                    if (!stableStartTimeRef.current) stableStartTimeRef.current = now;
                                    const dur = now - stableStartTimeRef.current;
                                    const prog = Math.min(100, (dur / 200) * 100);
                                    setStabilityProgress(prog);
                                    setGuidance(`Giữ yên... ${Math.round(prog)}%`);
                                    setDetectedPerson({ name: m.name, confidence: m.confidence });
                                    if (dur >= 200) {
                                        const exp = checkinCooldownsRef.current.get(m.userId);
                                        if (!exp || now > exp) handleAutoCheckin(m.userId, m.name, m.confidence);
                                        else { setGuidance('Đã check-in'); setStabilityProgress(100); }
                                    }
                                } else {
                                    recognizedPersonRef.current = { id: m.userId, name: m.name, confidence: m.confidence };
                                    stableStartTimeRef.current = now;
                                    setStabilityProgress(0);
                                }
                            } else {
                                setGuidance('Xác thực khuôn mặt...');
                                setDetectedPerson(null);
                                setStabilityProgress(0);
                            }
                        }
                    }
                } else {
                    setFaceBox(null);
                    setIsCloseEnough(false);
                    setFaceDetected(false);
                    setGuidance('Đang tìm mặt...');
                    setStabilityProgress(0);
                    stableStartTimeRef.current = null;
                    setDetectedPerson(null);
                }
            } catch (e) { } finally {
                isDetectingRef.current = false;
            }
            aid = requestAnimationFrame(loop);
        };
        loop(); return () => cancelAnimationFrame(aid);
    }, [modelsReady, studentsLoaded, systemReady, checkinMode]);

    return (
        <>
            <div className="min-h-screen bg-slate-900 flex flex-col pt-12 md:pt-16 px-1 md:px-4 pb-1 md:pb-4 gap-2 md:gap-4 lg:flex-row font-sans">
                {(!modelsReady || !studentsLoaded) && (
                    <div className="fixed inset-0 z-[200] bg-slate-900 flex items-center justify-center p-4">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-pulse">
                                <UserCheck className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Khởi tạo hệ thống</h2>
                            <p className="text-slate-400">Đang tải dữ liệu và AI...</p>
                        </div>
                    </div>
                )}

                {/* Header - compact on mobile */}
                <div className="absolute top-0 left-0 right-0 h-11 md:h-14 bg-slate-800/90 backdrop-blur-md flex items-center justify-between px-2 md:px-4 z-20 border-b border-white/10">
                    <div className="flex items-center gap-1.5 md:gap-2">
                        {onBack && <button onClick={onBack} className="p-1 md:p-1.5 text-white hover:bg-white/10 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>}
                        <h1 className="text-white font-bold text-sm md:text-base flex items-center gap-1.5">
                            <span className="bg-indigo-600 p-1 rounded-lg hidden md:flex"><UserCheck className="w-4 h-4" /></span>
                            <span className="hidden md:inline">Nội trú</span>
                            <span className="md:hidden">🏠</span>
                        </h1>
                    </div>

                    {/* Mode toggle - icons on mobile */}
                    <div className="flex gap-0.5 md:gap-1 bg-slate-700/50 p-0.5 md:p-1 rounded-lg md:rounded-xl">
                        <button
                            onClick={() => switchCheckinMode('face')}
                            className={`px-2 md:px-3 py-1 rounded-md md:rounded-lg text-[10px] md:text-xs font-bold flex items-center gap-1 ${checkinMode === 'face' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                        >
                            <UserIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span className="hidden md:inline">Face</span>
                        </button>
                        <button
                            onClick={() => switchCheckinMode('qr')}
                            className={`px-2 md:px-3 py-1 rounded-md md:rounded-lg text-[10px] md:text-xs font-bold flex items-center gap-1 ${checkinMode === 'qr' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
                        >
                            <QrCode className="w-3 h-3 md:w-3.5 md:h-3.5" />
                            <span className="hidden md:inline">QR</span>
                        </button>
                    </div>

                    {/* Status indicators - compact on mobile */}
                    <div className="flex items-center gap-1.5 md:gap-3">
                        {/* AI Signal Dot - Restored to Header */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                            <div className={`w-2 h-2 rounded-full ${modelsReady && studentsLoaded ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500'} transition-all`} />
                            <span className="text-[10px] font-black text-white/70 uppercase tracking-tighter hidden sm:inline">AI</span>
                        </div>

                        {/* Fullscreen Toggle */}
                        <button
                            onClick={() => {
                                if (!document.fullscreenElement) document.documentElement.requestFullscreen();
                                else if (document.exitFullscreen) document.exitFullscreen();
                            }}
                            className="p-1.5 bg-white/5 text-white hover:bg-white/10 rounded-lg border border-white/10 shadow-sm transition-all active:scale-95"
                            title="Phóng to"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>

                        {!isOnline && (
                            <div className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-bold">
                                <AlertTriangle className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                <span className="hidden md:inline">OFFLINE</span>
                            </div>
                        )}
                        {pendingSyncCount > 0 && isOnline && (
                            <div className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-bold">
                                <RefreshCw className="w-2.5 h-2.5 md:w-3 md:h-3 animate-spin" />
                                <span>{pendingSyncCount}</span>
                            </div>
                        )}
                        <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${systemReady ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></div>

                        {/* Night Mode Toggle */}
                        <button
                            onClick={() => setIsLowLight(!isLowLight)}
                            className={`p-1.5 md:p-2 rounded-lg border transition-all active:scale-95 ${isLowLight ? 'bg-white text-indigo-600 border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'bg-white/5 text-white/60 border-white/10'}`}
                            title="Bù sáng ban đêm"
                        >
                            <Moon className={`w-4 h-4 ${isLowLight ? 'fill-indigo-600' : ''}`} />
                        </button>
                        <span className="text-white/60 text-[10px] md:text-xs font-mono hidden md:inline">{new Date().toLocaleTimeString()}</span>
                    </div>
                </div>

                <div className="flex-1 lg:flex-[2] relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 min-h-[300px] md:min-h-[350px]">
                    {cameraError && (
                        <div className="absolute inset-0 z-[150] bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                                <CameraOff className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="text-white font-bold text-lg mb-2">Lỗi Camera</h3>
                            <p className="text-slate-400 text-sm mb-6 max-w-[240px] leading-relaxed">{cameraError}</p>
                            <button
                                onClick={handleRetryCamera}
                                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95"
                            >
                                <RotateCcw className="w-4 h-4 animate-spin-once" />
                                Thử lại ngay
                            </button>
                        </div>
                    )}
                    {checkinMode === 'face' ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" /> :
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 overflow-hidden">
                            <div id="qr-reader" className="w-full max-w-md overflow-hidden rounded-2xl"></div>
                            {checkinMode === 'qr' && (
                                <button onClick={() => switchCheckinMode('qr', cameraFacing === 'environment' ? 'user' : 'environment')} className="absolute bottom-4 right-4 p-2 bg-slate-800 rounded-full text-white"><FlipHorizontal2 /></button>
                            )}
                        </div>}

                    {/* Low Light Flash Overlay */}
                    {isLowLight && (
                        <div className="absolute inset-0 bg-white z-[5] animate-pulse pointer-events-none opacity-40 shadow-[inset_0_0_100px_rgba(255,255,255,1)]" />
                    )}

                    {/* Dynamic Face tracking frame */}
                    {checkinMode === 'face' && faceBox && (
                        <div
                            className="absolute pointer-events-none z-10 transition-all duration-75"
                            style={{
                                left: faceBox.x + 16, // +16 for container padding p-4
                                top: faceBox.y + 16,
                                width: faceBox.width,
                                height: faceBox.height
                            }}
                        >
                            <div className={`absolute inset-0 border-2 rounded-2xl md:rounded-[24px] transition-all duration-300 ${multipleFaces ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)]' :
                                isCloseEnough ? 'border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.3)]' :
                                    'border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                                }`}>

                                {/* Corners */}
                                <div className={`absolute -top-[2px] -left-[2px] w-8 h-8 md:w-10 md:h-10 border-t-4 border-l-4 rounded-tl-2xl md:rounded-tl-[24px] transition-colors duration-300 ${multipleFaces ? 'border-red-500' : isCloseEnough ? 'border-emerald-500' : 'border-indigo-500/50'}`}></div>
                                <div className={`absolute -top-[2px] -right-[2px] w-8 h-8 md:w-10 md:h-10 border-t-4 border-r-4 rounded-tr-2xl md:rounded-tr-[24px] transition-colors duration-300 ${multipleFaces ? 'border-red-500' : isCloseEnough ? 'border-emerald-500' : 'border-indigo-500/50'}`}></div>
                                <div className={`absolute -bottom-[2px] -left-[2px] w-8 h-8 md:w-10 md:h-10 border-b-4 border-l-4 rounded-bl-2xl md:rounded-bl-[24px] transition-colors duration-300 ${multipleFaces ? 'border-red-500' : isCloseEnough ? 'border-emerald-500' : 'border-indigo-500/50'}`}></div>
                                <div className={`absolute -bottom-[2px] -right-[2px] w-8 h-8 md:w-10 md:h-10 border-b-4 border-r-4 rounded-br-2xl md:rounded-br-[24px] transition-colors duration-300 ${multipleFaces ? 'border-red-500' : isCloseEnough ? 'border-emerald-500' : 'border-indigo-500/50'}`}></div>

                                {/* Radar Wave Effect inside dynamic box */}
                                <div className={`absolute inset-0 overflow-hidden rounded-2xl md:rounded-[24px] transition-opacity duration-500 ${isCloseEnough ? 'opacity-30' : 'opacity-10'}`}>
                                    <div className="radar-beam" style={{ animationDuration: '2s' }}></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Status Badge - INSIDE the Container */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-max z-30">
                        <div className={`px-4 md:px-6 py-2 md:py-3 rounded-2xl md:rounded-[24px] font-black text-[12px] md:text-[14px] shadow-2xl backdrop-blur-2xl border-2 transition-all duration-300 ${faceDetected ? (stabilityProgress >= 100 ? 'bg-emerald-600/90 border-emerald-400 text-white' : 'bg-indigo-600/90 border-indigo-400 text-white') : (checkinMode === 'qr' ? 'bg-indigo-600/90 border-indigo-400/50 text-white' : 'bg-slate-900/90 border-white/20 text-white/90')}`}>
                            {checkinMode === 'qr' ? (qrScannerActive ? '📱 Đưa mã QR vào khung' : '⏳ Khởi động quét QR...') : guidance}
                        </div>
                    </div>

                    {/* Stability Progress Bar - Bottom of Frame */}
                    {faceDetected && stabilityProgress < 100 && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-32 h-2 bg-black/60 rounded-full overflow-hidden border border-white/20 z-30">
                            <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-100" style={{ width: `${stabilityProgress}%` }}></div>
                        </div>
                    )}

                    {/* Physical borders and corners REMOVED as requested to avoid clutter */}
                </div>

                <div className="w-full lg:w-96 flex flex-col gap-3">
                    <div className={`p-5 rounded-3xl border ${selectedSlot ? (slotStatus === 'on_time' ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-amber-900/20 border-amber-500/30') : 'bg-slate-800/50'}`}>
                        <div className="flex justify-between mb-2">
                            <span className="text-white/60 text-xs uppercase font-bold">Trạng thái</span>
                            <span className={`text-[10px] font-bold ${systemReady ? 'text-emerald-400' : 'text-amber-400'}`}>{systemReady ? '● LIVE' : 'SYNCING'}</span>
                        </div>
                        {selectedSlot ? <div><h2 className="text-white font-black text-xl">{selectedSlot.name}</h2><p className="text-white/40 text-xs">{selectedSlot.start_time} - {selectedSlot.end_time}</p></div> : <div className="text-center py-4 text-slate-500">Ngoài giờ</div>}
                    </div>
                    <div className="flex-1 bg-slate-800/50 p-5 rounded-3xl border border-white/10 overflow-hidden flex flex-col hidden md:flex">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white/80 font-bold flex items-center gap-2 text-sm uppercase"><History className="w-4 h-4" /> Vừa Check-in</h3>
                            <button
                                onClick={() => setShowAttendanceModal(true)}
                                className="p-2 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl transition-all border border-indigo-500/30"
                                title="Xem tất cả"
                            >
                                <Users className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                            {recentCheckins.length === 0 ? <p className="text-slate-600 text-center py-10 italic">Trống</p> : recentCheckins.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                                    {item.image ? (
                                        <img src={item.image} alt={item.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">{item.name[0]}</div>
                                    )}
                                    <div className="flex-1 min-w-0"><p className="text-white font-bold truncate text-sm">{item.name}</p><p className="text-indigo-300 text-[10px]">{item.type} • {item.time}</p></div>
                                    <div className={item.status === 'success' ? 'text-emerald-400' : 'text-amber-400'}>{item.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Mobile Floating Buttons - MOVED TO RIGHT */}
                    <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3 z-[95]">
                        <button
                            onClick={() => setShowAttendanceModal(true)}
                            className="p-4 bg-emerald-600 rounded-full shadow-2xl text-white transform active:scale-95 transition-all"
                        >
                            <Users className="w-6 h-6" />
                            {checkedInIds.size > 0 && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-white text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-emerald-600">
                                    {checkedInIds.size}
                                </div>
                            )}
                        </button>
                    </div>
                </div>

                {/* Attendance List Modal */}
                {showAttendanceModal && (
                    <div className="fixed inset-0 z-[400] flex items-center justify-center md:p-6 animate-fade-in">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAttendanceModal(false)} />

                        <div className="relative w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl bg-slate-900 md:rounded-[32px] overflow-hidden flex flex-col shadow-2xl border border-white/10">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                                <div>
                                    <h2 className="text-xl font-black text-white flex items-center gap-3">
                                        <Users className="w-6 h-6 text-indigo-400" />
                                        Danh sách điểm danh
                                    </h2>
                                    <p className="text-slate-400 text-xs font-medium mt-1">
                                        {selectedSlot?.name || 'Ngoài giờ'} • <span className="text-emerald-400">{checkedInIds.size} đã mặt</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowAttendanceModal(false)}
                                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="p-4 md:p-6 space-y-4">
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Tìm theo tên, mã hoặc phòng..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    {(['all', 'present', 'absent'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setAttendanceFilter(f)}
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${attendanceFilter === f
                                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                                                }`}
                                        >
                                            {f === 'all' ? 'Tất cả' : f === 'present' ? 'Có mặt' : 'Vắng'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 custom-scrollbar">
                                {Object.entries(
                                    (studentsData
                                        .filter(s => {
                                            const search = searchTerm.toLowerCase();
                                            const room = rooms.find(r => r.id === s.room_id)?.name || '';
                                            return s.full_name.toLowerCase().includes(search) ||
                                                (s.student_code && s.student_code.toLowerCase().includes(search)) ||
                                                room.toLowerCase().includes(search);
                                        })
                                        .filter(s => {
                                            const isCheckedIn = checkedInIds.has(s.id);
                                            if (attendanceFilter === 'present') return isCheckedIn;
                                            if (attendanceFilter === 'absent') return !isCheckedIn;
                                            return true;
                                        })
                                        .reduce((acc, s) => {
                                            const roomName = rooms.find(r => r.id === s.room_id)?.name || 'Chưa xếp phòng';
                                            if (!acc[roomName]) acc[roomName] = [];
                                            acc[roomName].push(s);
                                            return acc;
                                        }, {} as Record<string, User[]>)) as Record<string, User[]>
                                ).map(([roomName, students]) => (
                                    <div key={roomName} className="mb-6">
                                        <div className="flex items-center gap-2 mb-3 bg-slate-800/40 py-1.5 px-3 rounded-lg border-l-4 border-indigo-500">
                                            <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">{roomName}</span>
                                            <span className="text-[10px] text-slate-500 font-bold ml-auto">{(students as User[]).length} học sinh</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {(students as User[]).sort((a, b) => {
                                                const aChecked = checkedInIds.has(a.id);
                                                const bChecked = checkedInIds.has(b.id);
                                                if (aChecked && !bChecked) return -1;
                                                if (!aChecked && bChecked) return 1;
                                                return a.full_name.localeCompare(b.full_name);
                                            }).map(s => {
                                                const isCheckedIn = checkedInIds.has(s.id);
                                                return (
                                                    <div key={s.id} className={`p-2.5 rounded-2xl border flex items-center gap-3 transition-all ${isCheckedIn ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-slate-800/30 border-white/5 opacity-80'}`}>
                                                        <div className="relative">
                                                            {s.avatar_url ? (
                                                                <img src={s.avatar_url} alt={s.full_name} className="w-9 h-9 rounded-xl object-cover border border-white/10" />
                                                            ) : (
                                                                <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center border border-white/10">
                                                                    <span className="text-white/50 text-[10px] font-bold">{s.full_name.charAt(0)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-sm font-bold text-white truncate">{s.full_name}</h4>
                                                            <p className="text-[10px] text-slate-500 truncate mt-0.5">{s.student_code || 'N/A'}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {isCheckedIn && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                                                            <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter ${isCheckedIn ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-500'}`}>
                                                                {isCheckedIn ? 'Có mặt' : 'Vắng mặt'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {
                    result && (
                        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                            <div className="bg-slate-800 p-8 rounded-3xl text-center max-w-sm w-full border border-white/10">
                                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 ${result.status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'}`}>{result.status === 'late' ? <AlertTriangle className="text-white w-10 h-10" /> : <CheckCircle className="text-white w-10 h-10" />}</div>
                                <h2 className="text-white font-black text-2xl mb-2">{result.user?.full_name}</h2>
                                <p className={result.status === 'late' ? 'text-amber-400' : 'text-emerald-400'}>{result.message}</p>
                                {result.points !== undefined && result.points !== null && result.points !== 0 && (
                                    <div className={`mt-4 inline-block px-4 py-2 rounded-full font-bold text-lg ${result.points > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {result.points > 0 ? '+' : ''}{result.points} điểm
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    showConfigModal && (
                        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md">
                                <div className="flex justify-between mb-6"><h3 className="text-white font-bold">Cấu hình</h3><button onClick={() => setShowConfigModal(false)}><X className="text-slate-400" /></button></div>
                                <div className="space-y-4">
                                    {['Sáng', 'Trưa', 'Tối'].map((lbl, i) => {
                                        const key = i === 0 ? 'morning_curfew' : i === 1 ? 'noon_curfew' : 'evening_curfew';
                                        return <div key={key}><label className="text-xs text-slate-500 font-bold uppercase">{lbl}</label><input type="time" value={configForm[key as keyof BoardingConfig]} onChange={e => setConfigForm({ ...configForm, [key]: e.target.value })} className="w-full bg-slate-800 border-slate-700 rounded-xl p-3 text-white" /></div>
                                    })}
                                </div>
                                <button onClick={handleSaveConfig} className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-bold">Lưu cấu hình</button>
                            </div>
                        </div>
                    )
                }
            </div>
        </>
    );
};

export default BoardingCheckin;

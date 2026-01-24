import React, { useState, useRef, useEffect, useCallback } from 'react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { faceService, faceMatcher, base64ToImage, stringToDescriptor, descriptorToString } from '../../services/faceService';
import { qrScannerService } from '../../services/qrScannerService';
import { Event, User, EventCheckin, CheckinMethod } from '../../types';
import { Camera, X, CheckCircle, RefreshCw, AlertTriangle, ChevronLeft, Settings, Clock, User as UserIcon, QrCode, FlipHorizontal2 } from 'lucide-react';

// Interface for event participant with face data
interface EventParticipant {
    id: string; // The participant ID (from event_participants table)
    full_name: string;
    avatar_url?: string;
    birth_date?: string;
    organization?: string;
    student_code?: string; // Added field
    hasFaceDescriptor?: boolean;
    face_descriptor?: string; // Stored JSON descriptor
    user_id?: string; // Link to system user
}

interface CheckinPageProps {
    event?: Event;
    currentUser?: User;
    onBack: () => void;
}

interface CheckinResult {
    success: boolean;
    message: string;
    checkin?: EventCheckin;
    capturedImage?: string;
    userName?: string;
}

// Sound effects using Web Audio API
interface NotificationState {
    type: 'success' | 'error' | 'warning';
    message: string;
}

let audioContext: AudioContext | null = null;
let audioEnabled = true;

const getAudioContext = (): AudioContext | null => {
    if (!audioEnabled) return null;
    try {
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }
        return audioContext;
    } catch {
        audioEnabled = false;
        return null;
    }
};

const playSound = (type: 'success' | 'detect' | 'error') => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        // Resume if suspended (required for user interaction)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        if (type === 'success') {
            oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
            oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
        } else if (type === 'detect') {
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.1);
        } else {
            oscillator.frequency.setValueAtTime(200, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
        }
    } catch {
        // Silently ignore audio errors
    }
};

const CheckinPage: React.FC<CheckinPageProps> = ({ event, currentUser, onBack }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const isProcessingRef = useRef(false); // Ref for loop access
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [result, setResult] = useState<CheckinResult | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [faceDetected, setFaceDetected] = useState(false);
    const faceDetectedRef = useRef(false); // Ref for stale closure fix
    const [lastFaceDetectedTime, setLastFaceDetectedTime] = useState<number | null>(null);
    const lastFaceDetectedTimeRef = useRef<number | null>(null); // Ref for stale closure fix
    const [recentCheckins, setRecentCheckins] = useState<Array<{ name: string; time: string; image?: string; status: string }>>([]);

    // Check-in cooldown map (userId -> timestamp)
    const checkinCooldownsRef = useRef<Map<string, number>>(new Map());
    const COOLDOWN_PERIOD = 60000; // 60 seconds cooldown
    const [sensitivity, setSensitivity] = useState(50); // Optimized: 50% (Slightly more sensitive for speed)

    // New states for improvements
    const [autoCheckInMode, setAutoCheckInMode] = useState(true);
    // const [checkinMode, setCheckinMode] = useState<'student' | 'event'>('student'); // REMOVED: Using event.checkin_mode
    // const [enableSuccessPopup, setEnableSuccessPopup] = useState(true); // REMOVED: Using event.enable_popup
    const [faceStableTime, setFaceStableTime] = useState(0);
    const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
    // lastFaceDetectedTime removed (duplicate)
    const [multipleFaces, setMultipleFaces] = useState(false);
    const autoCheckInRef = useRef<boolean>(false);
    const facesLoadedRef = useRef<boolean>(false); // Ref for closure fix

    // Notification state
    const [notification, setNotification] = useState<NotificationState | null>(null);

    // Auto clear notification
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Modal state for user details
    const [selectedUser, setSelectedUser] = useState<any>(null);

    // States for face recognition check-in
    const [participants, setParticipants] = useState<EventParticipant[]>([]);
    const [loadingFaces, setLoadingFaces] = useState(false);
    const [facesLoaded, setFacesLoaded] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
    const [recognizedPerson, setRecognizedPerson] = useState<{ id: string; name: string; confidence: number } | null>(null);

    // Dynamic Face Tracking Box State
    const [faceBox, setFaceBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

    // QR Mode States
    const [checkinMode, setCheckinMode] = useState<'face' | 'qr'>('face');
    const [qrScannerActive, setQrScannerActive] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('user');
    const [guidance, setGuidance] = useState<string>('');

    // Smart Alert State - Prevent repetitive "Already Checked In" alerts
    const [lastReportedCheckinId, setLastReportedCheckinId] = useState<string | null>(null);
    const lastReportedCheckinIdRef = useRef<string | null>(null);

    // Network & Sync status
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);

    // Ref to track if success overlay is active (to silence redundant alerts)
    const successActiveRef = useRef(false);
    useEffect(() => {
        successActiveRef.current = showSuccessOverlay;
    }, [showSuccessOverlay]);

    // Unified function to add check-in to list without duplicates
    const addUniqueCheckin = (checkin: any) => {
        setRecentCheckins(prev => {
            // Check for various forms of identity to prevent duplication
            const alreadyExists = prev.some(c => {
                const sameUserId = (c as any).user_id && checkin.user_id && (c as any).user_id === checkin.user_id;
                const sameParticipantId = (c as any).participant_id && checkin.participant_id && (c as any).participant_id === checkin.participant_id;
                const sameNameAndTime = c.name === checkin.name && c.time === checkin.time;

                return sameUserId || sameParticipantId || sameNameAndTime;
            });

            if (alreadyExists) {
                console.log('⏭️ List update: Skipping duplicate entry for', checkin.name);
                return prev;
            }

            // Keep last 15
            return [checkin, ...prev.slice(0, 14)];
        });
    };

    // Load face-api.js models
    useEffect(() => {
        const loadModels = async () => {
            if (event?.require_face) {
                setIsLoadingModels(true);
                try {
                    await faceService.loadModels();
                    setModelsReady(true);
                } catch (err) {
                    console.error('Failed to load face models:', err);
                } finally {
                    setIsLoadingModels(false);
                }
            }
        };
        loadModels();
    }, [event?.require_face]);

    // Initialize sensitivity from event settings
    useEffect(() => {
        if (event?.face_threshold) {
            // Respect the event setting directly
            setSensitivity(event.face_threshold);
        }
    }, [event]);

    // Load event participants and their face descriptors
    useEffect(() => {
        const loadParticipantsAndFaces = async () => {
            if (!event?.id || !modelsReady) return;

            setLoadingFaces(true);
            faceMatcher.clearAll(); // Clear previous faces

            try {
                // Load participants from Event_Participants sheet
                const result = await dataService.getEventParticipants(event.id);
                console.log('📋 getEventParticipants result:', result);

                if (result.success && result.data) {
                    const loadedParticipants: EventParticipant[] = result.data.map((p: any) => ({
                        id: p.id,
                        full_name: p.full_name,
                        avatar_url: p.user?.avatar_url || p.avatar_url, // Prefer user's avatar (more reliable)
                        birth_date: p.birth_date,
                        organization: p.organization,
                        // Fix: Load identitifer fields
                        student_code: p.student_code || p.user?.student_code || '',
                        qr_code: p.qr_code || '',
                        user_id: p.user_id,
                        // CRITICAL FIX: Prefer authoritative face_descriptor from 'users' table if linked
                        face_descriptor: p.user?.face_descriptor || p.face_descriptor,
                        hasFaceDescriptor: false
                    }));

                    console.log('👥 Loaded participants:', loadedParticipants.length, loadedParticipants.map(p => ({ name: p.full_name, hasAvatar: !!p.avatar_url, avatarLength: p.avatar_url?.length || 0 })));
                    setParticipants(loadedParticipants);

                    // Generate face descriptors SEQUENTIALLY with progress tracking
                    const participantsWithAvatars = loadedParticipants.filter(p => p.avatar_url);

                    // Initialize progress
                    setLoadingProgress({ current: 0, total: participantsWithAvatars.length });
                    let loadedCount = 0;

                    // Process SEQUENTIALLY so we can show real progress (and avoid overwhelming browser)
                    for (let i = 0; i < participantsWithAvatars.length; i++) {
                        const participant = participantsWithAvatars[i];
                        try {
                            // OPTIMIZATION: Try to use cached face_descriptor first (MUCH FASTER)
                            if (participant.face_descriptor) {
                                try {
                                    const descriptor = stringToDescriptor(participant.face_descriptor);
                                    faceMatcher.addFace(participant.id, descriptor, participant.full_name);
                                    participant.hasFaceDescriptor = true;
                                    console.log(`⚡ Used cached descriptor for ${participant.full_name}`);
                                    loadedCount++;
                                    setLoadingProgress({ current: i + 1, total: participantsWithAvatars.length });
                                    continue;
                                } catch (e) {
                                    console.warn(`⚠️ Invalid cached descriptor for ${participant.full_name}, will recompute`);
                                }
                            }

                            // Fallback: Compute from Image (SLOW) & Save to DB
                            const img = await base64ToImage(participant.avatar_url!);
                            const descriptor = await faceService.getFaceDescriptor(img);
                            if (descriptor) {
                                faceMatcher.addFace(participant.id, descriptor, participant.full_name);
                                participant.hasFaceDescriptor = true;
                                loadedCount++;

                                // OPTIMIZATION: Save computed descriptor to DB for next time
                                const descriptorStr = descriptorToString(descriptor);
                                // Run in background, don't await
                                dataService.updateParticipantFaceDescriptor(participant.id, descriptorStr)
                                    .then(res => {
                                        if (res.success) console.log(`💾 Saved face descriptor for ${participant.full_name}`);
                                    });
                            }
                        } catch (err) {
                            console.error(`❌ Failed to load face for ${participant.full_name}:`, err);
                        }

                        // Update progress
                        setLoadingProgress({ current: i + 1, total: participantsWithAvatars.length });
                    }

                    console.log(`✅ Total: Loaded ${loadedCount} face descriptors for ${loadedParticipants.length} participants`);
                    facesLoadedRef.current = true; // Update ref for closure
                    setFacesLoaded(true);
                } else {
                    console.error('❌ Failed to load participants:', result.error);
                }
            } catch (error) {
                console.error('Failed to load participants:', error);
            } finally {
                setLoadingFaces(false);
            }
        };

        loadParticipantsAndFaces();

        // Set initial sync count
        setPendingSyncCount(dataService.getOfflineQueueLength());

        // Network listeners
        const handleOnline = () => {
            setIsOnline(true);
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
    }, [event?.id, modelsReady]);

    // OPTIMIZED: Load existing check-ins (limit 15) + REALTIME SYNC
    useEffect(() => {
        if (!event?.id) return;

        const loadCheckins = async () => {
            try {
                // Get checkins from API
                const result = await dataService.getEventCheckins(event.id);
                if (result.success && result.data) {
                    // 1. Populate Cooldowns/Existing Check-ins Map with ALL data
                    // This ensures we know who checked in even after refresh
                    result.data.forEach(c => {
                        if (c.user_id) {
                            checkinCooldownsRef.current.set(c.user_id, new Date(c.checkin_time).getTime());
                        }
                    });

                    const mapped = result.data.slice(0, 15).map(c => ({
                        name: c.participants?.full_name || 'Unknown',
                        time: new Date(c.checkin_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase(),
                        image: c.participants?.avatar_url,
                        status: c.status,
                        student_code: c.participants?.student_code || 'N/A',
                        organization: c.participants?.organization || 'N/A',
                        birth_date: c.participants?.birth_date
                            ? (isNaN(new Date(c.participants.birth_date).getTime()) ? c.participants.birth_date : new Date(c.participants.birth_date).toLocaleDateString('vi-VN'))
                            : 'N/A',
                        points: c.points_earned,
                        user_id: c.user_id // Store user_id for duplicate detection
                    }));
                    setRecentCheckins(mapped);
                    console.log(`📋 Loaded ${mapped.length} recent check-ins`);
                }
            } catch (err) {
                console.error('Failed to load check-ins:', err);
            }
        };

        loadCheckins();

        loadCheckins();

        // ========== REALTIME SUBSCRIPTION ==========
        // Subscribe to new check-ins for this event from ANY device
        const channel = supabase
            .channel(`checkins:${event.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'checkins',
                    filter: `event_id=eq.${event.id}`
                },
                async (payload) => {
                    console.log('🔔 Realtime: New check-in received!', payload.new);
                    const newCheckin = payload.new as any;

                    // DUPLICATE FIX: Multiple checks to prevent duplicate entries
                    const pId = newCheckin.participant_id;
                    const uId = newCheckin.user_id;

                    // Check 1: If this device just checked in this user (<5 sec ago), skip
                    // Check BOTH participant_id and user_id for maximum safety
                    const pCooldown = pId ? checkinCooldownsRef.current.get(pId) : null;
                    const uCooldown = uId ? checkinCooldownsRef.current.get(uId) : null;
                    const now = Date.now();

                    if ((pCooldown && now - pCooldown < 5000) || (uCooldown && now - uCooldown < 5000)) {
                        console.log('⏭️ Realtime: Skipping (cooldown active for this user)');
                        return;
                    }

                    // Update cooldown for check-ins from OTHER devices
                    if (pId) checkinCooldownsRef.current.set(pId, now);
                    if (uId) checkinCooldownsRef.current.set(uId, now);

                    // Fetch participant info for display
                    let participant = participants.find(p => p.id === newCheckin.user_id);

                    // If not found locally, fetch from DB to avoid "Người tham gia" placeholder
                    if (!participant && newCheckin.user_id) {
                        try {
                            const { data: user } = await supabase
                                .from('event_participants')
                                .select('full_name, avatar_url, student_code, organization, birth_date')
                                .eq('event_id', event.id)
                                .eq('user_id', newCheckin.user_id)
                                .single();

                            if (user) {
                                participant = {
                                    id: newCheckin.user_id,
                                    full_name: user.full_name,
                                    avatar_url: user.avatar_url,
                                    student_code: user.student_code,
                                    organization: user.organization,
                                    birth_date: user.birth_date
                                } as any;
                            }
                        } catch (err) {
                            console.error('Error fetching participant details for realtime:', err);
                        }
                    }

                    // Check 2 & Add via Helper
                    addUniqueCheckin({
                        name: participant?.full_name || 'Người tham gia',
                        time: new Date(newCheckin.checkin_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase(),
                        image: participant?.avatar_url,
                        status: newCheckin.status,
                        student_code: (participant as any).student_code || 'N/A',
                        organization: participant?.organization || 'N/A',
                        participant_id: newCheckin.participant_id,
                        user_id: newCheckin.user_id,
                        points: newCheckin.points_earned
                    });
                }
            )
            .subscribe((status) => {
                console.log(`📡 Realtime subscription status: ${status}`);
            });

        // Cleanup subscription on unmount
        return () => {
            console.log('🔌 Unsubscribing from realtime...');
            supabase.removeChannel(channel);
        };
    }, [event?.id, participants]);
    // Store recognizedPerson in ref to avoid race conditions during check-in
    const recognizedPersonRef = useRef<{ id: string; name: string; confidence: number } | null>(null);
    useEffect(() => {
        recognizedPersonRef.current = recognizedPerson;
    }, [recognizedPerson]);

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
            setCameraError('Không thể truy cập camera. Vui lòng cấp quyền.');
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

    // QR Check-in Handler
    const handleQRCheckin = async (studentCode: string) => {
        if (isProcessing) return;

        // Find participant by student_code, qr_code or ID (Robust comparison)
        const participant = participants.find(p => {
            const cleanInput = studentCode.replace('EDUCHECK_USER:', '').trim();
            const cleanPCode = (p.student_code || '').replace('EDUCHECK_USER:', '').trim();
            const cleanPQr = (p.qr_code || '').replace('EDUCHECK_USER:', '').trim();

            return (
                cleanPCode === cleanInput ||
                cleanPQr === cleanInput ||
                p.id === cleanInput ||
                p.id === studentCode || // Fallback for raw UUID
                p.user_id === cleanInput // CRITICAL FIX: Allow matching by system user_id
            );
        });

        if (!participant) {
            setNotification({ type: 'error', message: `Mã không hợp lệ: ${studentCode}` });
            playSound('error');
            return;
        }

        // Check cooldown
        const now = Date.now();
        const lastCheckin = checkinCooldownsRef.current.get(participant.id);

        // Show "already checked in" warning only if NOT currently showing a success popup
        // and some time has passed since the SUCCESS check-in to avoid overlap
        if (lastCheckin && now - lastCheckin < COOLDOWN_PERIOD) {
            if (!successActiveRef.current && !result) {
                setNotification({ type: 'warning', message: `${participant.full_name} đã check-in rồi!` });
            }
            return;
        }

        // Perform check-in
        await handleCheckIn(participant, 100);
    };

    // Switch mode logic
    const switchCheckinMode = async (mode: 'face' | 'qr', newFacing?: 'environment' | 'user') => {
        // Stop ALL active scanners first to prevent conflicts
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

        const facing = newFacing || cameraFacing;
        if (newFacing) setCameraFacing(newFacing);

        setCheckinMode(mode);

        // Start QR scanner if switching to QR mode
        if (mode === 'qr') {
            setTimeout(async () => {
                try {
                    await qrScannerService.startScanning(
                        'qr-reader-event',
                        (result) => {
                            if (result.code) {
                                handleQRCheckin(result.code);
                            }
                        },
                        (error) => {
                            console.error('QR Scanner error:', error);
                        },
                        facing
                    );
                    setQrScannerActive(true);
                } catch (err) {
                    console.error('Failed to start QR scanner:', err);
                }
            }, 400);
        }
    };

    // Initialize/Sync Camera Mode
    useEffect(() => {
        if (checkinMode === 'face' && modelsReady) {
            // Small delay to ensure QR scanner fully released camera
            const timer = setTimeout(() => {
                startFaceCamera();
            }, 200);
            return () => {
                clearTimeout(timer);
                stopFaceCamera();
            };
        }
        return () => {
            if (checkinMode === 'qr') {
                qrScannerService.stopScanner();
                setQrScannerActive(false);
            }
        };
    }, [checkinMode, modelsReady, event?.id]);

    // Initialize specific mode from event settings
    useEffect(() => {
        if (event) {
            const method = event.checkin_method || (event.require_face ? 'face' : 'qr');
            if (method === 'qr') switchCheckinMode('qr');
            else if (method === 'face') switchCheckinMode('face');
            else if (method === 'both') switchCheckinMode('face'); // Default 'both' to face
        }
    }, [event?.id]);

    // SIMPLIFIED Real-time face detection with auto check-in
    // Logic: Detect face -> Wait 1s stable -> Check-in once -> Show result
    useEffect(() => {
        if (!event?.require_face || !modelsReady || !videoRef.current || checkinMode !== 'face') return;

        let animationId: number;
        let checkInAttempted = false; // Flag to prevent multiple attempts

        let lastDetectionTime = 0;
        // MOBILE OPTIMIZATION: Adaptive detection interval
        // - Mobile: 400ms (~2.5 FPS) to prevent lag and battery drain
        // - Desktop: 150ms (~6.5 FPS) for smoother experience
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const DETECTION_INTERVAL = isMobile ? 200 : 100; // Optimized: 10 FPS on desktop, 5 FPS on mobile

        const detectLoop = async () => {
            if (!videoRef.current || videoRef.current.readyState !== 4) {
                animationId = requestAnimationFrame(detectLoop);
                return;
            }

            // Skip if already processing or attempted check-in
            // Use ref to check instantaneous state (avoid closure staleness)
            if (isProcessingRef.current || checkInAttempted) {
                setTimeout(() => {
                    animationId = requestAnimationFrame(detectLoop);
                }, 500);
                return;
            }

            // Throttling: Skip frames if interval hasn't passed
            const now = Date.now();
            if (now - lastDetectionTime < DETECTION_INTERVAL) {
                animationId = requestAnimationFrame(detectLoop);
                return;
            }
            lastDetectionTime = now;

            try {
                // Performance Optimization: Check if video is actually playing
                if (videoRef.current.paused || videoRef.current.ended) {
                    animationId = requestAnimationFrame(detectLoop);
                    return;
                }

                const detections = await faceService.detectFaces(videoRef.current);

                // --- STRICT FACE SELECTION LOGIC ---
                // Filter detections to get only the largest face (The main user)
                // This eliminates background ghost faces
                let primaryDetection = null;
                let isFaceTooSmall = false;

                if (detections.length > 0) {
                    // Sort by box area (width * height) descending
                    const sortedDetections = [...detections].sort((a, b) => {
                        const areaA = a.detection.box.width * a.detection.box.height;
                        const areaB = b.detection.box.width * b.detection.box.height;
                        return areaB - areaA; // Largest first
                    });

                    // Only take the largest face
                    primaryDetection = sortedDetections[0];

                    // Check if the face is large enough (at least 25% of video width)
                    if (primaryDetection && videoRef.current) {
                        const faceWidth = primaryDetection.detection.box.width;
                        const videoWidth = videoRef.current.videoWidth;
                        const sizeRatio = faceWidth / videoWidth;

                        // If face is too far (small), ignore it
                        if (sizeRatio < 0.25) {
                            isFaceTooSmall = true;
                        }
                    }
                }

                // We proceed as if only 1 face exists (the largest one)
                // This effectively ignores other smaller faces
                const faceCount = (primaryDetection && !isFaceTooSmall) ? 1 : 0;

                // Get box of the first face and update tracking state
                if (primaryDetection && !isFaceTooSmall && primaryDetection.detection) {
                    const box = primaryDetection.detection.box;
                    const videoEl = videoRef.current;

                    // ... rest of the box drawing logic ...
                    // (I'll keep the existing box logic but wrap it in the size check)

                    // Get actual displayed dimensions to scale the box correctly
                    const displayWidth = videoEl.clientWidth;
                    const displayHeight = videoEl.clientHeight;
                    const originalWidth = videoEl.videoWidth;
                    const originalHeight = videoEl.videoHeight;

                    // Calculate scale factors (prevent divide by zero)
                    const scaleX = originalWidth > 0 ? displayWidth / originalWidth : 1;
                    const scaleY = originalHeight > 0 ? displayHeight / originalHeight : 1;

                    // Scale the box dimensions
                    const scaledWidth = box.width * scaleX;
                    const scaledHeight = box.height * scaleY;
                    const scaledX = box.x * scaleX;
                    const scaledY = box.y * scaleY;

                    // Correctly mirror the X coordinate
                    const mirroredX = displayWidth - scaledX - scaledWidth;

                    setFaceBox({
                        x: mirroredX,
                        y: scaledY,
                        width: scaledWidth,
                        height: scaledHeight
                    });
                } else {
                    setFaceBox(null);
                }

                setMultipleFaces(detections.length > 1); // Still warn if multiple faces exist physically
                const singleFaceDetected = faceCount === 1;

                // Update face detected state
                if (singleFaceDetected !== faceDetectedRef.current) {
                    if (singleFaceDetected && !faceDetectedRef.current) {
                        setLastFaceDetectedTime(Date.now());
                        lastFaceDetectedTimeRef.current = Date.now();
                    } else if (!singleFaceDetected) {
                        // STRICT RESET: Face lost or too small
                        setLastFaceDetectedTime(null);
                        lastFaceDetectedTimeRef.current = null;
                        setFaceStableTime(0);
                    }
                    setFaceDetected(singleFaceDetected);
                    faceDetectedRef.current = singleFaceDetected;

                    // Reset reported ID when face is lost so we can alert again when they return
                    if (!singleFaceDetected) {
                        setLastReportedCheckinId(null);
                        lastReportedCheckinIdRef.current = null;
                    }
                }

                // Try to recognize person
                let currentMatch: { userId: string; name: string; confidence: number } | null = null;

                if (singleFaceDetected && facesLoadedRef.current && primaryDetection) {
                    const descriptor = primaryDetection.descriptor;
                    if (descriptor) {
                        // FIX: Do NOT exclude checked-in users. We need to find them to show "Already Checked In" status.
                        const match = faceMatcher.findMatch(descriptor, sensitivity);
                        currentMatch = match;

                        // Check cooldown (double check just in case)
                        if (match) {
                            const lastCheckin = checkinCooldownsRef.current.get(match.userId);
                            if (lastCheckin && Date.now() - lastCheckin < COOLDOWN_PERIOD) {
                                // Already checked in - logic to prevent repetitive alerts

                                // Only alert if we haven't reported this user recently in this session (frame loop)
                                // AND silence if a success popup is already active
                                if (lastReportedCheckinIdRef.current !== match.userId && !successActiveRef.current) {
                                    setRecognizedPerson({ id: match.userId, name: match.name, confidence: match.confidence });

                                    // Show guidance instead of result for "already checked in"
                                    if (!successActiveRef.current) {
                                        setGuidance(`${match.name} đã check-in rồi`);

                                        // Still allow showing the "Success info" if they just checked in 
                                        // but don't force a full results popup if one is already active
                                        if (!result) {
                                            setResult({
                                                success: true,
                                                message: `✅ ${match.name} đã check-in thành công!`,
                                                userName: match.name
                                            });

                                            // Only show popup for a fresh success, not a reminder
                                            // setTimeout(() => setShowSuccessOverlay(true), 300);
                                        }

                                        // Update guidance to remind them to leave
                                        setTimeout(() => {
                                            if (faceDetectedRef.current && recognizedPersonRef.current?.id === match.userId) {
                                                setGuidance(`${match.name} - Vui lòng rời khỏi camera`);
                                            }
                                        }, 2000);
                                    }

                                    // Mark this user as reported so we don't beep again
                                    setLastReportedCheckinId(match.userId);
                                    lastReportedCheckinIdRef.current = match.userId;
                                }

                                setTimeout(() => { animationId = requestAnimationFrame(detectLoop); }, 200);
                                return;
                            }
                        }

                        // Update recognized person (with debounce for stability)
                        if (match) {
                            const prev = recognizedPersonRef.current;
                            if (!prev || prev.id !== match.userId) {
                                setRecognizedPerson({ id: match.userId, name: match.name, confidence: match.confidence });
                                // CRITICAL FIX: Reset stability timer if person changes to prevent "glitch" check-ins
                                setLastFaceDetectedTime(Date.now());
                                lastFaceDetectedTimeRef.current = Date.now();
                            }
                        } else {
                            if (recognizedPersonRef.current !== null) {
                                // Don't clear immediately to prevent flickering, maybe add grace period?
                                // For now, keep as is
                                setRecognizedPerson(null);
                            }
                        }
                    }
                } else if (!singleFaceDetected) {
                    if (recognizedPersonRef.current !== null) {
                        setRecognizedPerson(null);
                        recognizedPersonRef.current = null; // FORCE GLOBAL REF RESET
                    }
                    setLastFaceDetectedTime(null);
                    lastFaceDetectedTimeRef.current = null;
                    setFaceStableTime(0);
                    setGuidance(''); // Clear guidance
                    setLastReportedCheckinId(null);
                    lastReportedCheckinIdRef.current = null;
                }

                // AUTO CHECK-IN: After stabilization
                const lastTime = lastFaceDetectedTimeRef.current;
                const isCooldown = currentMatch ? checkinCooldownsRef.current.has(currentMatch.userId) : false;

                if (autoCheckInMode && singleFaceDetected && currentMatch && !checkInAttempted && !isCooldown) {
                    if (!lastTime) {
                        setLastFaceDetectedTime(Date.now());
                        lastFaceDetectedTimeRef.current = Date.now();
                        return;
                    }

                    const stableMs = Date.now() - lastTime;
                    const TARGET_STABILITY = 300; // Faster (0.3s)
                    setFaceStableTime(Math.min(stableMs, TARGET_STABILITY));

                    if (stableMs >= TARGET_STABILITY) {
                        setGuidance('Đang check-in...');
                        checkInAttempted = true;
                        autoCheckInRef.current = true;
                        handleCheckIn();
                        // Don't continue loop, wait for check-in to complete
                        return;
                    }
                }

            } catch (err) {
                console.error('Face detection error:', err);
            }

            // Continue loop with faster 100ms delay for smoother tracking
            setTimeout(() => {
                animationId = requestAnimationFrame(detectLoop);
            }, 100);
        };

        detectLoop();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [modelsReady, event?.require_face, autoCheckInMode, isProcessing, result, sensitivity]);

    // Capture image from video
    const captureImage = (): string | null => {
        if (!videoRef.current || !canvasRef.current) return null;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    };

    // Handle check-in
    const handleCheckIn = useCallback(async (manualParticipant?: EventParticipant, manualConfidence?: number) => {
        if (!event || isProcessing) return;

        // Determine who to check-in
        let checkInUserId: string;
        let checkInUserName: string;
        let confidenceScore: number;

        // Use ref to get latest recognized person (avoid race condition)
        const latestRecognizedPerson = recognizedPersonRef.current;

        if (manualParticipant) {
            checkInUserId = manualParticipant.id;
            checkInUserName = manualParticipant.full_name;
            confidenceScore = manualConfidence || 100;
        } else if (facesLoaded && latestRecognizedPerson) {
            // Use recognized person from face matching
            checkInUserId = latestRecognizedPerson.id;
            checkInUserName = latestRecognizedPerson.name;
            confidenceScore = latestRecognizedPerson.confidence;
            console.log('✅ Check-in for recognized person:', checkInUserName);
        } else {
            // No face recognized and no fallback allowed for Face ID mode
            setResult({ success: false, message: 'Không xác định được người check-in' });
            return;
        }

        setIsProcessing(true);

        // OPTIMISTIC UPDATE: Add to cooldown immediately to prevent double-submit loop from rapid frames
        checkinCooldownsRef.current.set(checkInUserId, Date.now());

        // DISABLED: No longer capturing image for check-in to save generic storage
        const capturedImage = undefined;

        try {
            let faceConfidence = confidenceScore;
            let faceVerified = !!latestRecognizedPerson || !!manualParticipant;

            if (event.require_face && videoRef.current) {
                const detections = await faceService.detectFaces(videoRef.current);
                if (detections.length === 0) {
                    setResult({ success: false, message: 'Không nhận diện được khuôn mặt' });
                    // playSound('error');
                    setIsProcessing(false);
                    autoCheckInRef.current = false;
                    return;
                }

                // If faces are loaded but no one recognized, show warning
                if (facesLoaded && !latestRecognizedPerson) {
                    setResult({ success: false, message: '⚠️ Không nhận ra người này trong danh sách sự kiện!' });
                    // playSound('error');
                    setIsProcessing(false);
                    autoCheckInRef.current = false;
                    return;
                }

                faceConfidence = latestRecognizedPerson?.confidence || (detections[0].detection.score * 100);
                // Person is verified if recognized OR meets event threshold
                // The logic here is simplified because if we reach this point with latestRecognizedPerson,
                // it means a match was found above the sensitivity threshold.
                // The `face_verified` flag is more for cases where face is optional or just detected.
                // For `require_face` and a recognized person, it's implicitly verified.
            }

            const participant = participants.find(p => p.id === checkInUserId);
            const displayAvatar = participant?.avatar_url || undefined;

            const checkinResult = await dataService.checkin({
                event_id: event.id,
                participant_id: checkInUserId, // This is event_participants.id
                user_id: participant?.user_id, // Link to system users
                face_confidence: faceConfidence,
                face_verified: faceVerified,
                checkin_mode: event.checkin_mode || 'student'
            });

            if (checkinResult.success && checkinResult.data) {
                if (checkinResult.alreadyExists) {
                    console.log('ℹ️ User already checked in');
                    setResult({
                        success: true,
                        message: `Bạn đã check-in rồi!`,
                        capturedImage: displayAvatar,
                        userName: checkInUserName
                    });
                    // Don't add to recent checkins list
                } else {
                    playSound('success');
                    console.log('Check-in SUCCESS:', checkinResult);

                    setResult({
                        success: true,
                        message: `Check-in lúc ${new Date().toLocaleTimeString('vi-VN')}`,
                        checkin: checkinResult.data.checkin,
                        capturedImage: displayAvatar,
                        userName: checkInUserName
                    });

                    // Update recent checkins list via Helper
                    addUniqueCheckin({
                        name: checkInUserName,
                        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase(),
                        image: displayAvatar,
                        status: checkinResult.data.checkin.status,
                        full_name: participant?.full_name,
                        organization: participant?.organization,
                        student_code: (participant as any).student_code,
                        birth_date: participant?.birth_date
                            ? (isNaN(new Date(participant.birth_date).getTime()) ? participant.birth_date : new Date(participant.birth_date).toLocaleDateString('vi-VN'))
                            : 'N/A',
                        points: checkinResult.data.checkin.points_earned,
                        participant_id: checkInUserId,
                        user_id: participant?.user_id
                    });
                }

                // Add to cooldown to prevent duplicate check-in attempts (Set BOTH)
                const now = Date.now();
                checkinCooldownsRef.current.set(checkInUserId, now);
                if (participant?.user_id) checkinCooldownsRef.current.set(participant.user_id, now);

                // Show fullscreen success overlay if enabled (Added slight delay for UX)
                const shouldShowPopup = event.enable_popup !== undefined ? event.enable_popup : true;
                if (shouldShowPopup) {
                    setTimeout(() => {
                        setShowSuccessOverlay(true);
                    }, 400); // 0.4s delay so user can blink/adjust

                    setTimeout(() => {
                        setShowSuccessOverlay(false);
                        setResult(null);
                        autoCheckInRef.current = false;
                        setLastFaceDetectedTime(null);
                        setFaceStableTime(0);
                    }, 3500);
                } else {
                    // Quick reset if popup disabled
                    setNotification({ type: 'success', message: 'Check-in thành công!' });
                    setTimeout(() => {
                        setResult(null);
                        autoCheckInRef.current = false;
                        setLastFaceDetectedTime(null);
                        setFaceStableTime(0);
                    }, 3000);
                }
            } else {
                // playSound('error');
                console.error('Check-in FAILED:', checkinResult);

                const errorMsg = checkinResult.error || 'Check-in thất bại';
                const isAlreadyCheckedIn = errorMsg.toLowerCase().includes('already') ||
                    errorMsg.toLowerCase().includes('đã check-in') ||
                    errorMsg.includes('đã điểm danh');

                setResult({
                    success: false,
                    message: isAlreadyCheckedIn ? '⚠️ Người này đã check-in rồi!' : errorMsg,
                    userName: checkInUserName
                });

                // Show notification for visibility
                setNotification({
                    type: 'error',
                    message: isAlreadyCheckedIn ? 'Người này đã check-in rồi' : errorMsg
                });

                // If already checked in, add to cooldown to prevent retries
                if (isAlreadyCheckedIn) {
                    checkinCooldownsRef.current.set(checkInUserId, Date.now());
                }

                // Auto clear error after 3 seconds
                setTimeout(() => {
                    setResult(null);
                    autoCheckInRef.current = false;
                    setLastFaceDetectedTime(null);
                    setFaceStableTime(0);
                }, 3000);
            }
        } catch (error: any) {
            console.error('Check-in EXCEPTION:', error);
            playSound('error');
            setResult({ success: false, message: 'Lỗi hệ thống: ' + (error.message || 'Unknown') });
            setNotification({ type: 'error', message: 'Lỗi kết nối khi check-in' });
            autoCheckInRef.current = false;
            setIsProcessing(false);
        } finally {
            setIsProcessing(false);
        }
    }, [event, currentUser, isProcessing, facesLoaded, recognizedPerson]);

    if (cameraError) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 text-center max-w-md shadow-2xl">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">Không thể truy cập camera</h2>
                    <p className="text-slate-500 mb-6">{cameraError}</p>
                    <button onClick={onBack} className="px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200">
                        ← Quay lại
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex">
            {/* ========== LOADING OVERLAY ========== */}
            {(isLoadingModels || loadingFaces) && (
                <div className="fixed inset-0 z-[200] bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex flex-col items-center justify-center">
                    <div className="text-center">
                        {/* Animated Logo */}
                        <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse shadow-2xl shadow-indigo-500/30">
                            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                        </div>

                        <h2 className="text-3xl font-black text-white mb-4">Đang khởi tạo hệ thống</h2>
                        <p className="text-indigo-300 text-lg mb-10 max-w-md mx-auto">Vui lòng chờ trong giây lát để đảm bảo hệ thống check-in hoạt động chính xác nhất.</p>

                        {/* Loading Steps */}
                        <div className="space-y-4 max-w-sm mx-auto text-left">
                            {/* Step 1: AI Models */}
                            <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl ${modelsReady ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/10 border border-white/10'}`}>
                                {modelsReady ? (
                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 bg-indigo-500/50 rounded-xl flex items-center justify-center flex-shrink-0 animate-spin">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </div>
                                )}
                                <div>
                                    <p className={`font-bold ${modelsReady ? 'text-emerald-400' : 'text-white'}`}>Mô hình AI nhận diện khuôn mặt</p>
                                    <p className={`text-sm ${modelsReady ? 'text-emerald-400/70' : 'text-indigo-300/70'}`}>{modelsReady ? 'Đã sẵn sàng' : 'Đang tải...'}</p>
                                </div>
                            </div>

                            {/* Step 2: User Data */}
                            <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl ${facesLoaded ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/10 border border-white/10'}`}>
                                {facesLoaded ? (
                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 bg-indigo-500/50 rounded-xl flex items-center justify-center flex-shrink-0 animate-spin">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                    </div>
                                )}
                                <div>
                                    <p className={`font-bold ${facesLoaded ? 'text-emerald-400' : 'text-white'}`}>Dữ liệu người tham gia ({participants.length})</p>
                                    <p className={`text-sm ${facesLoaded ? 'text-emerald-400/70' : 'text-indigo-300/70'}`}>
                                        {facesLoaded
                                            ? 'Đã sẵn sàng'
                                            : loadingProgress.total > 0
                                                ? `Đang xử lý ${loadingProgress.current}/${loadingProgress.total}...`
                                                : 'Đang tải danh sách...'
                                        }
                                    </p>
                                    {/* Progress Bar */}
                                    {!facesLoaded && loadingProgress.total > 0 && (
                                        <div className="w-full h-1.5 bg-white/20 rounded-full mt-2 overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                                                style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in ${notification.type === 'success' ? 'bg-emerald-500 text-white' :
                    notification.type === 'error' ? 'bg-red-500 text-white' :
                        'bg-amber-500 text-white'
                    }`}>
                    {notification.type === 'success' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : notification.type === 'error' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    )}
                    <div>
                        <p className="font-bold">{notification.type === 'success' ? 'Thành công' : notification.type === 'error' ? 'Lỗi' : 'Chú ý'}</p>
                        <p className="text-sm opacity-90">{notification.message}</p>
                    </div>
                </div>
            )}

            {/* Fullscreen Success Overlay */}
            {showSuccessOverlay && result?.success && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 animate-fade-in">
                    {/* Animated background particles */}
                    <div className="absolute inset-0 overflow-hidden">
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="absolute w-4 h-4 bg-white/20 rounded-full animate-float"
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    top: `${Math.random() * 100}%`,
                                    animationDelay: `${Math.random() * 2}s`,
                                    animationDuration: `${3 + Math.random() * 2}s`
                                }}
                            />
                        ))}
                    </div>

                    <div className="text-center z-10 animate-scale-in">
                        {/* Large check icon */}
                        <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl animate-bounce-once">
                            <svg className="w-16 h-16 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        {/* User photo */}
                        {result.capturedImage && (
                            <div className="mb-6">
                                <img
                                    src={result.capturedImage}
                                    alt="Check-in"
                                    className="w-40 h-40 rounded-3xl object-cover mx-auto border-4 border-white shadow-2xl"
                                />
                            </div>
                        )}

                        {/* Success message */}
                        <h1 className="text-5xl font-black text-white mb-4 drop-shadow-lg">
                            CHECK-IN THÀNH CÔNG!
                        </h1>

                        <p className="text-3xl font-bold text-white/90 mb-2">
                            {result.userName}
                        </p>

                        <p className="text-xl text-white/70 mb-6">
                            {result.message}
                        </p>

                        {/* Status and points */}
                        {result.checkin && (
                            <div className="flex items-center justify-center gap-6 text-xl">
                                <span className={`px-6 py-3 rounded-full font-bold ${result.checkin.status === 'on_time'
                                    ? 'bg-white/20 text-white'
                                    : 'bg-amber-500/30 text-amber-200'
                                    }`}>
                                    {result.checkin.status === 'on_time' ? '✓ Đúng giờ' : '⚠ Đi muộn'}
                                </span>
                                <span className={`px-6 py-3 rounded-full font-bold ${result.checkin.points_earned >= 0
                                    ? 'bg-white/20 text-white'
                                    : 'bg-red-500/30 text-red-200'
                                    }`}>
                                    {result.checkin.points_earned >= 0 ? '+' : ''}{result.checkin.points_earned} điểm
                                </span>
                            </div>
                        )}

                        {/* Auto close indicator */}
                        <div className="mt-8">
                            <div className="w-64 h-2 bg-white/20 rounded-full mx-auto overflow-hidden">
                                <div className="h-full bg-white rounded-full animate-shrink" />
                            </div>
                            <p className="text-white/50 text-sm mt-2">Tự động đóng sau vài giây...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Left Side - Camera & Check-in */}
            <div className="flex-1 relative h-screen">
                {/* Header - Mobile Responsive */}
                <div className="absolute top-0 left-0 right-0 z-[100] p-4 md:p-6 flex justify-between items-center bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                    <button onClick={onBack} className="group px-4 py-2.5 bg-white/5 backdrop-blur-xl text-white rounded-2xl font-bold text-xs md:text-sm hover:bg-white/10 flex items-center gap-2 transition-all border border-white/10 shadow-2xl">
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span>Quay lại</span>
                    </button>

                    <div className="flex-1 flex justify-center items-center gap-4">
                        {!isOnline && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-2xl text-[10px] font-black animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                OFFLINE
                            </div>
                        )}
                        {pendingSyncCount > 0 && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-2xl text-[10px] font-black">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                {pendingSyncCount} CHỜ XỬ LÝ
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Hybrid Mode Toggle - PREMIUM STYLE */}
                        {event && (event.checkin_method === 'both' || !event.checkin_method) && (
                            <div className="bg-black/60 backdrop-blur-2xl p-1.5 rounded-[22px] flex border border-white/10 shadow-2xl">
                                <button
                                    onClick={() => switchCheckinMode('face')}
                                    className={`px-5 py-2.5 rounded-[18px] text-[11px] font-black flex items-center gap-2.5 transition-all duration-500 ${checkinMode === 'face' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30' : 'text-white/40 hover:text-white/70'}`}
                                >
                                    <UserIcon className={`w-4 h-4 ${checkinMode === 'face' ? 'animate-pulse' : ''}`} />
                                    <span>Face ID</span>
                                </button>
                                <button
                                    onClick={() => switchCheckinMode('qr')}
                                    className={`px-5 py-2.5 rounded-[18px] text-[11px] font-black flex items-center gap-2.5 transition-all duration-500 ${checkinMode === 'qr' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30' : 'text-white/40 hover:text-white/70'}`}
                                >
                                    <QrCode className={`w-4 h-4 ${checkinMode === 'qr' ? 'animate-bounce' : ''}`} />
                                    <span>Quét QR</span>
                                </button>
                            </div>
                        )}

                        {/* Auto check-in toggle */}
                        {checkinMode === 'face' && (
                            <button
                                onClick={() => setAutoCheckInMode(!autoCheckInMode)}
                                className={`px-4 py-2.5 backdrop-blur-xl rounded-2xl font-black text-[11px] transition-all duration-300 flex items-center gap-2 border border-white/10 shadow-xl ${autoCheckInMode
                                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-white/5 text-white/40'
                                    }`}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full ${autoCheckInMode ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white/20'}`} />
                                <span>Tự động</span>
                            </button>
                        )}

                        {checkinMode === 'qr' && (
                            <button
                                onClick={() => switchCheckinMode('qr', cameraFacing === 'user' ? 'environment' : 'user')}
                                className="w-11 h-11 bg-white/5 backdrop-blur-xl text-white rounded-2xl flex items-center justify-center border border-white/10 hover:bg-white/10 shadow-xl transition-all active:scale-95"
                            >
                                <FlipHorizontal2 className="w-5 h-5" />
                            </button>
                        )}

                        {event && (
                            <div className="bg-white/10 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/10 shadow-lg hidden sm:block">
                                <p className="text-white text-xs font-black tracking-tight">{event.name}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sensitivity Slider */}
                {checkinMode === 'face' && (
                    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 w-[90%] max-w-xs group">
                        <div className="bg-black/40 backdrop-blur-3xl rounded-[28px] p-4 border border-white/10 shadow-2xl transition-all hover:bg-black/60">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <span className="text-white/50 text-[10px] font-black uppercase tracking-[0.1em]">Độ nhạy AI</span>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${sensitivity < 35 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                    {sensitivity}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="20"
                                max="80"
                                step="5"
                                value={sensitivity}
                                onChange={(e) => setSensitivity(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 group-hover:accent-indigo-400 transition-all"
                            />
                        </div>
                    </div>
                )}

                {/* Advanced Settings Controls - Bottom Right */}
                {/* Advanced Settings Controls REMOVED - Managed in Event Settings */}

                {/* Main Viewport */}
                <div className="w-full h-full relative bg-slate-950 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-50 pointer-events-none"></div>
                    {checkinMode === 'face' ? (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-contain transform -scale-x-100 transition-opacity duration-700"
                            />
                            <canvas ref={canvasRef} className="hidden" />
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950">
                            <div className="w-full max-w-md aspect-square rounded-[40px] overflow-hidden border-2 border-white/5 relative shadow-2xl group">
                                {/* Decorative corners for QR area */}
                                <div className="absolute inset-x-0 inset-y-0 z-10 pointer-events-none p-12">
                                    <div className="w-full h-full border-2 border-white/10 border-dashed rounded-[32px] flex items-center justify-center">
                                        <div className="w-12 h-12 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl absolute top-8 left-8"></div>
                                        <div className="w-12 h-12 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl absolute top-8 right-8"></div>
                                        <div className="w-12 h-12 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl absolute bottom-8 left-8"></div>
                                        <div className="w-12 h-12 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl absolute bottom-8 right-8"></div>

                                        {/* Animated scanner light */}
                                        <div className="w-[80%] h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent absolute shadow-[0_0_20px_rgba(52,211,153,0.6)] animate-scan-slow opacity-80"></div>
                                    </div>
                                </div>

                                <div id="qr-reader-event" className="w-full h-full bg-black"></div>
                            </div>

                            <div className="mt-12 text-center animate-fade-in space-y-3">
                                <div className="inline-flex px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-2">
                                    Scanning Active
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tight">Đang chờ quét QR...</h3>
                                <p className="text-slate-400 text-sm font-medium">Đưa mã QR học sinh vào khung để ghi nhận điểm danh</p>
                            </div>
                        </div>
                    )}

                    {/* Auto check-in progress bar */}
                    {autoCheckInMode && faceDetected && faceStableTime > 0 && !isProcessing && !result && (
                        <div className="absolute -bottom-8 left-0 right-0">
                            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-150"
                                    style={{ width: `${Math.min((faceStableTime / 400) * 100, 100)}%` }}
                                />
                            </div>
                            <p className="text-center text-white/70 text-xs mt-1">
                                Giữ yên để check-in...
                            </p>
                        </div>
                    )}

                    {/* Processing indicator */}
                    {isProcessing && (
                        <div className="absolute -bottom-8 left-0 right-0">
                            <div className="flex items-center justify-center gap-2 text-indigo-400">
                                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm font-medium">Đang xử lý...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Dynamic Face Tracking Box */}
                {checkinMode === 'face' && faceBox && (
                    <div
                        className={`absolute border-2 rounded-2xl transition-all duration-200 ease-out ${isProcessing ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-pulse' :
                            faceDetected ? 'border-indigo-500 shadow-[0_0_40px_rgba(99,102,241,0.4)]' : 'border-white/20'
                            }`}
                        style={{
                            top: `${faceBox.y}px`,
                            left: `${faceBox.x}px`,
                            width: `${faceBox.width}px`,
                            height: `${faceBox.height}px`
                        }}
                    >
                        {/* More modern tracking corners */}
                        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-[3px] border-l-[3px] border-indigo-400 rounded-tl-xl transition-all duration-300"></div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-[3px] border-r-[3px] border-indigo-400 rounded-tr-xl transition-all duration-300"></div>
                        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-[3px] border-l-[3px] border-indigo-400 rounded-bl-xl transition-all duration-300"></div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-[3px] border-r-[3px] border-indigo-400 rounded-br-xl transition-all duration-300"></div>

                        {/* Person Name Floating Badge */}
                        {recognizedPerson && faceDetected && !isProcessing && (
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-indigo-600 px-4 py-1.5 rounded-full shadow-2xl animate-bounce-subtle border border-indigo-400/30">
                                <span className="text-white text-xs font-black whitespace-nowrap">{recognizedPerson.name}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Status badges - LEFT CORNER */}
                <div className="absolute top-24 left-6 flex flex-col items-start gap-4 z-10 pointer-events-none">
                    {/* Status Badge */}
                    <div className={`px-5 py-2 rounded-2xl backdrop-blur-2xl text-white text-[11px] font-black shadow-2xl border border-white/10 transition-all duration-500 ${checkinMode === 'face' ? 'bg-indigo-600/40 text-indigo-100' : 'bg-emerald-600/40 text-emerald-100'}`}>
                        <div className="flex items-center gap-2.5">
                            {checkinMode === 'face' ? <UserIcon className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                            <span className="uppercase tracking-widest">{checkinMode === 'face' ? 'Face Identity Active' : 'QR Scanner Active'}</span>
                        </div>
                    </div>

                    {isLoadingModels && (
                        <div className="px-5 py-2.5 bg-amber-500/20 backdrop-blur-xl border border-amber-500/30 rounded-2xl text-amber-400 text-[10px] font-black animate-pulse flex items-center gap-2.5 shadow-2xl">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ĐANG TẢI AI...
                        </div>
                    )}

                    {/* Face status badge - compact on mobile */}
                    {checkinMode === 'face' && modelsReady && !showSuccessOverlay && (
                        <div className={`px-4 py-2 rounded-2xl text-[10px] font-black flex items-center gap-2.5 transition-all border shadow-2xl backdrop-blur-xl ${multipleFaces ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' :
                            faceDetected ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                            }`}>
                            {multipleFaces ? (
                                <>
                                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span className="hidden md:inline">Chỉ 1 người!</span>
                                    <span className="md:hidden">1 người!</span>
                                </>
                            ) : faceDetected ? (
                                <>
                                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="hidden md:inline">Đã nhận diện</span>
                                    <span className="md:hidden">OK</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3 h-3 md:w-4 md:h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="hidden md:inline">Đưa khuôn mặt vào</span>
                                    <span className="md:hidden">Tìm mặt...</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ALERTS & RESULTS - CENTER SCREEN */}
                {/* ALERTS & RESULTS - TOP CENTER */}
                <div className="absolute top-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-20 w-full max-w-md px-4 pointer-events-none">

                    {/* Recognized Person Badge */}
                    {recognizedPerson && faceDetected && !isProcessing && !showSuccessOverlay && (
                        <div className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl text-white shadow-lg animate-scale-in">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-black text-lg">{recognizedPerson.name}</p>
                                    <p className="text-white/70 text-xs">Độ chính xác: {Math.round(recognizedPerson.confidence)}%</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* No match warning */}
                    {/* No match warning - compact */}
                    {faceDetected && facesLoaded && !recognizedPerson && !isProcessing && !showSuccessOverlay && (
                        <div className="px-2 py-1 md:px-3 md:py-1.5 bg-amber-500/90 rounded-full text-white text-[10px] md:text-xs font-bold flex items-center gap-1">
                            <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="hidden md:inline">Không nhận ra - không có trong danh sách</span>
                            <span className="md:hidden">Không nhận ra</span>
                        </div>

                    )}

                    {/* Already Checked-in Warning */}
                    {faceDetected && facesLoaded && recognizedPerson && checkinCooldownsRef.current.has(recognizedPerson.id) &&
                        (Date.now() - (checkinCooldownsRef.current.get(recognizedPerson.id) || 0) < COOLDOWN_PERIOD) && !showSuccessOverlay && (
                            <div className="px-4 py-2 bg-emerald-500/90 rounded-full text-white text-xs font-bold flex items-center gap-2 animate-bounce-once">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Đã check-in! Vui lòng rời khỏi camera
                            </div>
                        )}

                    {/* Loading faces indicator */}
                    {loadingFaces && (
                        <div className="px-4 py-2 bg-indigo-500/80 rounded-full text-white text-xs font-bold flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Đang tải ảnh người tham gia...
                        </div>
                    )}
                </div>

                {/* Manual Check-in Button (when auto mode is off) */}
                {
                    !autoCheckInMode && checkinMode === 'face' && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                            <button
                                onClick={() => handleCheckIn()}
                                disabled={isProcessing || !faceDetected}
                                className={`px-12 py-5 rounded-2xl font-black text-xl shadow-2xl transition-all transform border-2 border-white/20 backdrop-blur-md ${isProcessing
                                    ? 'bg-slate-600/50 text-slate-300 cursor-not-allowed'
                                    : faceDetected
                                        ? 'bg-emerald-500 text-white hover:scale-105 hover:shadow-emerald-500/50 border-emerald-400'
                                        : 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                {isProcessing ? (
                                    <span className="flex items-center gap-3">
                                        <RefreshCw className="w-6 h-6 animate-spin" />
                                        Đang xử lý...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-3">
                                        <CheckCircle className="w-6 h-6" />
                                        CHECK-IN NGAY
                                    </span>
                                )}
                            </button>
                        </div>
                    )
                }
            </div>

            {/* Right Side - Info Panel (HIDDEN ON MOBILE) */}
            <div className="hidden md:flex w-96 bg-slate-800/95 backdrop-blur-xl p-6 flex-col border-l border-slate-700">
                {/* Event Info */}
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 mb-6 shadow-lg">
                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <p className="text-indigo-200 text-sm font-medium">Sự kiện</p>
                            <h2 className="text-white text-xl font-black">{event?.name}</h2>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-black border border-white/10 ${checkinMode === 'face' ? 'bg-white/20 text-white' : 'bg-emerald-400/20 text-emerald-300'
                            }`}>
                            {checkinMode === 'face' ? 'Face ID' : 'QR Scan'}
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-indigo-200">
                        <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            {event?.location || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {event?.start_time ? new Date(event.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : 'N/A'}
                        </span>
                    </div>
                </div>

                {/* Recent Check-ins */}
                <div className="flex-1 overflow-hidden">
                    <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Check-in gần đây</h3>
                    {/* Recent Check-ins List */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {recentCheckins.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                                <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <p>Chưa có ai check-in</p>
                                <p className="text-xs mt-1 opacity-70">Đưa khuôn mặt vào khung để bắt đầu</p>
                            </div>
                        ) : (
                            recentCheckins.map((checkin, index) => (
                                <div
                                    key={index}
                                    onClick={() => setSelectedUser({
                                        name: checkin.name,
                                        image: checkin.image,
                                        time: checkin.time,
                                        status: checkin.status,
                                        organization: (checkin as any).organization || 'N/A',
                                        student_code: (checkin as any).student_code || 'N/A',
                                        birth_date: (checkin as any).birth_date ? new Date((checkin as any).birth_date).toLocaleDateString('vi-VN') : 'N/A'
                                    })}
                                    className="bg-slate-800/50 rounded-2xl p-3 flex items-center gap-3 border border-white/5 hover:bg-slate-700/50 transition-colors cursor-pointer animate-scale-in"
                                >
                                    <div className="relative">
                                        {checkin.image ? (
                                            <img
                                                src={checkin.image}
                                                alt={checkin.name}
                                                className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500/30"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center border-2 border-indigo-500/30">
                                                <span className="text-lg font-bold text-white/50">
                                                    {checkin.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                        {/* Status dot */}
                                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${checkin.status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-white truncate">{checkin.name}</h4>
                                        <p className="text-xs text-slate-400">{checkin.time}</p>
                                    </div>
                                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${checkin.status === 'late'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-emerald-500/20 text-emerald-400'
                                        }`}>
                                        {checkin.status === 'late' ? 'Đi muộn' : 'Đúng giờ'}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer Stats */}
                <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-xl p-4 text-center">
                            <p className="text-3xl font-black text-emerald-400">{recentCheckins.filter(c => c.status === 'on_time').length}</p>
                            <p className="text-emerald-600 text-xs font-medium">Đúng giờ</p>
                        </div>
                        <div className="bg-amber-900/30 border border-amber-800/50 rounded-xl p-4 text-center">
                            <p className="text-3xl font-black text-amber-400">{recentCheckins.filter(c => c.status !== 'on_time').length}</p>
                            <p className="text-amber-600 text-xs font-medium">Đi muộn</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scale-in {
                    from { transform: scale(0.8); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                @keyframes bounce-once {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; }
                    50% { transform: translateY(-20px) rotate(180deg); opacity: 1; }
                }
                @keyframes shrink {
                    from { width: 100%; }
                    to { width: 0%; }
                }
                @keyframes slide-in {
                    from { transform: translateX(20px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes scan-slow {
                    0%, 100% { transform: translateY(0); opacity: 0.3; }
                    50% { transform: translateY(220px); opacity: 1; }
                }
                @keyframes bounce-subtle {
                    0%, 100% { transform: translateX(-50%) translateY(0); }
                    50% { transform: translateX(-50%) translateY(-5px); }
                }
                .animate-scan-slow { animation: scan-slow 3s ease-in-out infinite; }
                .animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
                .animate-scale-in { animation: scale-in 0.4s ease-out; }
                .animate-bounce-once { animation: bounce-once 0.5s ease-out; }
                .animate-float { animation: float 3s ease-in-out infinite; }
                .animate-shrink { animation: shrink 4s linear forwards; }
                .animate-slide-in { animation: slide-in 0.3s ease-out; }
            `}</style>

            {/* User Details Modal */}
            {
                selectedUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setSelectedUser(null)}>
                        <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-700 animate-scale-in" onClick={e => e.stopPropagation()}>
                            <div className="text-center">
                                {selectedUser.image ? (
                                    <img src={selectedUser.image} alt={selectedUser.name} className="w-32 h-32 rounded-full object-cover mx-auto mb-4 border-4 border-indigo-500 shadow-xl" />
                                ) : (
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-4xl mx-auto mb-4 shadow-xl border-4 border-white/10">
                                        {selectedUser.name?.charAt(0)}
                                    </div>
                                )}

                                <h3 className="text-2xl font-bold text-white mb-1">{selectedUser.name}</h3>
                                {(selectedUser.student_code !== 'N/A' || selectedUser.organization !== 'N/A') && (
                                    <p className="text-indigo-300 font-medium mb-1">
                                        {[
                                            selectedUser.student_code !== 'N/A' ? selectedUser.student_code : null,
                                            selectedUser.organization !== 'N/A' ? selectedUser.organization : null
                                        ].filter(Boolean).join(' • ')}
                                    </p>
                                )}
                                {/* Organization already shown above, removed birth_date display */}

                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600">
                                        <p className="text-slate-400 text-xs">Thời gian check-in</p>
                                        <p className="text-white font-bold">{selectedUser.time}</p>
                                    </div>
                                    <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600">
                                        <p className="text-slate-400 text-xs">Trạng thái</p>
                                        <p className={`${selectedUser.status === 'on_time' ? 'text-emerald-400' : 'text-amber-400'} font-bold`}>
                                            {selectedUser.status === 'on_time' ? 'Đúng giờ' : 'Đi muộn'}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setSelectedUser(null)}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors"
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default CheckinPage;
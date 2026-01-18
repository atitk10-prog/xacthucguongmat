import React, { useState, useRef, useEffect, useCallback } from 'react';
import { dataService } from '../../services/dataService';
import { faceService, faceMatcher, base64ToImage, stringToDescriptor, descriptorToString } from '../../services/faceService';
import { Event, User, EventCheckin } from '../../types';

// Interface for event participant with face data
interface EventParticipant {
    id: string;
    full_name: string;
    avatar_url?: string;
    birth_date?: string;
    organization?: string;
    hasFaceDescriptor?: boolean;
    face_descriptor?: string; // Stored JSON descriptor
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
    const [checkinCooldowns, setCheckinCooldowns] = useState<Map<string, number>>(new Map());
    const COOLDOWN_PERIOD = 60000; // 60 seconds cooldown
    const [sensitivity, setSensitivity] = useState(35); // Default 35%

    // New states for improvements
    const [autoCheckInMode, setAutoCheckInMode] = useState(true);
    // const [checkinMode, setCheckinMode] = useState<'student' | 'event'>('student'); // REMOVED: Using event.checkin_mode
    // const [enableSuccessPopup, setEnableSuccessPopup] = useState(true); // REMOVED: Using event.enable_popup
    const [faceStableTime, setFaceStableTime] = useState(0);
    const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
    // lastFaceDetectedTime removed (duplicate)
    const [multipleFaces, setMultipleFaces] = useState(false);
    const autoCheckInRef = useRef<boolean>(false);

    // Notification state
    const [notification, setNotification] = useState<NotificationState | null>(null);

    // Auto clear notification
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // States for face recognition check-in
    const [participants, setParticipants] = useState<EventParticipant[]>([]);
    const [loadingFaces, setLoadingFaces] = useState(false);
    const [facesLoaded, setFacesLoaded] = useState(false);
    const [recognizedPerson, setRecognizedPerson] = useState<{ id: string; name: string; confidence: number } | null>(null);

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
            // Auto-fix: If threshold is set to old default 60% or high, lower it to 40% for better UX
            let threshold = event.face_threshold;
            if (threshold >= 60) threshold = 40;
            // If it's very low, keep it (e.g. 35)
            setSensitivity(threshold);
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
                    const loadedParticipants: EventParticipant[] = result.data.map((p: { id: string; full_name: string; avatar_url?: string; birth_date?: string; organization?: string; face_descriptor?: string }) => ({
                        id: p.id,
                        full_name: p.full_name,
                        avatar_url: p.avatar_url,
                        birth_date: p.birth_date,
                        organization: p.organization,
                        face_descriptor: p.face_descriptor,
                        hasFaceDescriptor: false
                    }));

                    console.log('👥 Loaded participants:', loadedParticipants.length, loadedParticipants.map(p => ({ name: p.full_name, hasAvatar: !!p.avatar_url, avatarLength: p.avatar_url?.length || 0 })));
                    setParticipants(loadedParticipants);

                    // Generate face descriptors in PARALLEL with DB optimization
                    const participantsWithAvatars = loadedParticipants.filter(p => p.avatar_url);

                    const loadFacePromises = participantsWithAvatars.map(async (participant) => {
                        try {
                            // 1. Try to use stored descriptor (INSTANT)
                            if (participant.face_descriptor) {
                                try {
                                    const descriptor = stringToDescriptor(participant.face_descriptor);
                                    faceMatcher.addFace(participant.id, descriptor, participant.full_name);
                                    participant.hasFaceDescriptor = true;
                                    return true;
                                } catch (e) {
                                    console.warn('Invalid stored descriptor for:', participant.full_name);
                                }
                            }

                            // 2. Fallback: Compute from Image (SLOW) & Save to DB
                            const img = await base64ToImage(participant.avatar_url!);
                            const descriptor = await faceService.getFaceDescriptor(img);
                            if (descriptor) {
                                faceMatcher.addFace(participant.id, descriptor, participant.full_name);
                                participant.hasFaceDescriptor = true;

                                // OPTIMIZATION: Save computed descriptor to DB for next time
                                const descriptorStr = descriptorToString(descriptor);
                                // Run in background, don't await
                                dataService.updateParticipantFaceDescriptor(participant.id, descriptorStr)
                                    .then(res => {
                                        if (res.success) console.log(`💾 Saved face descriptor for ${participant.full_name}`);
                                    });

                                return true;
                            }
                        } catch (err) {
                            console.error(`❌ Failed to load face for ${participant.full_name}:`, err);
                        }
                        return false;
                    });

                    const results = await Promise.all(loadFacePromises);
                    const loadedCount = results.filter(Boolean).length;

                    console.log(`✅ Total: Loaded ${loadedCount} face descriptors for ${loadedParticipants.length} participants`);
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
    }, [event?.id, modelsReady]);
    // Store recognizedPerson in ref to avoid race conditions during check-in
    const recognizedPersonRef = useRef<{ id: string; name: string; confidence: number } | null>(null);
    useEffect(() => {
        recognizedPersonRef.current = recognizedPerson;
    }, [recognizedPerson]);

    useEffect(() => {
        const startCamera = async () => {
            try {
                // Request camera with higher resolution for wider field of view
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 1280 }, // Lower resolution to prevent zoom/crop on some devices
                        height: { ideal: 720 }
                    }
                });
                setStream(mediaStream);
                if (videoRef.current) videoRef.current.srcObject = mediaStream;
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Lỗi không xác định';
                if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
                    setCameraError('Vui lòng cho phép truy cập camera trong cài đặt trình duyệt.');
                } else if (errorMessage.includes('NotFoundError')) {
                    setCameraError('Không tìm thấy camera. Vui lòng kiểm tra thiết bị.');
                } else if (!window.location.protocol.includes('https') && !window.location.hostname.includes('localhost')) {
                    setCameraError('Camera yêu cầu HTTPS. Vui lòng truy cập qua HTTPS.');
                } else {
                    setCameraError('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập trong trình duyệt.');
                }
            }
        };
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, []);

    // SIMPLIFIED Real-time face detection with auto check-in
    // Logic: Detect face -> Wait 1s stable -> Check-in once -> Show result
    useEffect(() => {
        if (!event?.require_face || !modelsReady || !videoRef.current) return;

        let animationId: number;
        let checkInAttempted = false; // Flag to prevent multiple attempts

        const detectLoop = async () => {
            if (!videoRef.current || videoRef.current.readyState !== 4) {
                animationId = requestAnimationFrame(detectLoop);
                return;
            }

            // Skip if already processing or showing result
            if (isProcessing || result || checkInAttempted) {
                setTimeout(() => {
                    animationId = requestAnimationFrame(detectLoop);
                }, 500);
                return;
            }

            try {
                const detections = await faceService.detectFaces(videoRef.current);
                const faceCount = detections.length;

                setMultipleFaces(faceCount > 1);
                const singleFaceDetected = faceCount === 1;

                // Update face detected state
                if (singleFaceDetected !== faceDetectedRef.current) {
                    if (singleFaceDetected && !faceDetectedRef.current) {
                        setLastFaceDetectedTime(Date.now());
                        lastFaceDetectedTimeRef.current = Date.now();
                    }
                    setFaceDetected(singleFaceDetected);
                    faceDetectedRef.current = singleFaceDetected;
                }

                // Try to recognize person
                let currentMatch: { userId: string; name: string; confidence: number } | null = null;

                if (singleFaceDetected && facesLoaded && detections.length > 0) {
                    const descriptor = detections[0].descriptor;
                    if (descriptor) {
                        const match = faceMatcher.findMatch(descriptor, sensitivity);
                        currentMatch = match;

                        // Check cooldown
                        if (match) {
                            const lastCheckin = checkinCooldowns.get(match.userId);
                            if (lastCheckin && Date.now() - lastCheckin < COOLDOWN_PERIOD) {
                                // Already checked in - show message and continue
                                setRecognizedPerson({ id: match.userId, name: match.name, confidence: match.confidence });
                                // Show "already checked in" message if not already showing
                                if (!result) {
                                    setResult({
                                        success: true,
                                        message: `✅ ${match.name} đã check-in sự kiện rồi!`,
                                        userName: match.name
                                    });
                                }
                                setTimeout(() => { animationId = requestAnimationFrame(detectLoop); }, 500);
                                return;
                            }
                        }

                        // Update recognized person (with debounce for stability)
                        if (match) {
                            const prev = recognizedPersonRef.current;
                            if (!prev || prev.id !== match.userId) {
                                setRecognizedPerson({ id: match.userId, name: match.name, confidence: match.confidence });
                            }
                        } else {
                            if (recognizedPersonRef.current !== null) {
                                setRecognizedPerson(null);
                            }
                        }
                    }
                } else if (!singleFaceDetected) {
                    if (recognizedPersonRef.current !== null) {
                        setRecognizedPerson(null);
                    }
                    setLastFaceDetectedTime(null);
                    lastFaceDetectedTimeRef.current = null;
                    setFaceStableTime(0);
                }

                // AUTO CHECK-IN: After 1 second stable with recognized face
                const lastTime = lastFaceDetectedTimeRef.current;
                if (autoCheckInMode && singleFaceDetected && currentMatch && lastTime && !checkInAttempted) {
                    const stableMs = Date.now() - lastTime;
                    setFaceStableTime(Math.min(stableMs, 1000));

                    if (stableMs >= 1000) {
                        console.log('🚀 Check-in after 1s stable:', currentMatch.name);
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

            // Continue loop with 500ms delay for smoother performance
            setTimeout(() => {
                animationId = requestAnimationFrame(detectLoop);
            }, 500);
        };

        detectLoop();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [modelsReady, event?.require_face, autoCheckInMode, isProcessing, result]);

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
    const handleCheckIn = useCallback(async () => {
        if (!event || isProcessing) return;

        // Determine who to check-in
        let checkInUserId: string;
        let checkInUserName: string;

        // Use ref to get latest recognized person (avoid race condition)
        const latestRecognizedPerson = recognizedPersonRef.current;

        if (facesLoaded && latestRecognizedPerson) {
            // Use recognized person from face matching
            checkInUserId = latestRecognizedPerson.id;
            checkInUserName = latestRecognizedPerson.name;
            console.log('✅ Check-in for recognized person:', checkInUserName);
        } else if (currentUser) {
            // Fallback to current user (admin mode) - only if no face match
            checkInUserId = currentUser.id;
            checkInUserName = currentUser.full_name;
            console.log('⚠️ Fallback to admin user:', checkInUserName);
        } else {
            setResult({ success: false, message: 'Không xác định được người check-in' });
            return;
        }

        setIsProcessing(true);
        const capturedImage = captureImage();

        try {
            let faceConfidence = latestRecognizedPerson?.confidence || 0;
            let faceVerified = false;

            if (event.require_face && videoRef.current) {
                const detections = await faceService.detectFaces(videoRef.current);
                if (detections.length === 0) {
                    setResult({ success: false, message: 'Không nhận diện được khuôn mặt' });
                    playSound('error');
                    setIsProcessing(false);
                    autoCheckInRef.current = false;
                    return;
                }

                // If faces are loaded but no one recognized, show warning
                if (facesLoaded && !latestRecognizedPerson) {
                    setResult({ success: false, message: '⚠️ Không nhận ra người này trong danh sách sự kiện!' });
                    playSound('error');
                    setIsProcessing(false);
                    autoCheckInRef.current = false;
                    return;
                }

                faceConfidence = latestRecognizedPerson?.confidence || (detections[0].detection.score * 100);
                // Person is verified if recognized OR meets event threshold
                const eventThreshold = event?.face_threshold || 60;
                faceVerified = latestRecognizedPerson !== null || faceConfidence >= eventThreshold;
            }

            const checkinResult = await dataService.checkin({
                event_id: event.id,
                user_id: checkInUserId,
                face_confidence: faceConfidence,
                face_verified: faceVerified || !event.require_face,
                checkin_mode: event.checkin_mode || 'student'
            });

            if (checkinResult.success && checkinResult.data) {
                playSound('success');
                console.log('Check-in SUCCESS:', checkinResult);

                setResult({
                    success: true,
                    message: `Check-in lúc ${new Date().toLocaleTimeString('vi-VN')}${latestRecognizedPerson ? ` (${Math.round(latestRecognizedPerson.confidence)}% match)` : ''}`,
                    checkin: checkinResult.data.checkin,
                    capturedImage: capturedImage || undefined,
                    userName: checkInUserName
                });

                // Update recent checkins list for right sidebar
                setRecentCheckins(prev => [{
                    name: checkInUserName,
                    time: new Date().toLocaleTimeString('vi-VN'),
                    image: capturedImage || undefined,
                    status: checkinResult.data.checkin.status
                }, ...prev.slice(0, 9)]); // Keep last 10

                // Add to cooldown to prevent duplicate check-in attempts
                setCheckinCooldowns(prev => new Map(prev).set(checkInUserId, Date.now()));

                // Show fullscreen success overlay if enabled
                const shouldShowPopup = event.enable_popup !== undefined ? event.enable_popup : true;
                if (shouldShowPopup) {
                    setShowSuccessOverlay(true);
                    setTimeout(() => {
                        setShowSuccessOverlay(false);
                        setResult(null);
                        autoCheckInRef.current = false;
                        setLastFaceDetectedTime(null);
                        setFaceStableTime(0);
                    }, 2000);
                } else {
                    // Quick reset if popup disabled
                    setNotification({ type: 'success', message: 'Check-in thành công!' });
                    setTimeout(() => {
                        setResult(null);
                        autoCheckInRef.current = false;
                        setLastFaceDetectedTime(null);
                        setFaceStableTime(0);
                    }, 2000);
                }
            } else {
                playSound('error');
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
                    setCheckinCooldowns(prev => new Map(prev).set(checkInUserId, Date.now()));
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
            <div className="flex-1 relative">
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-center">
                    <button onClick={onBack} className="px-4 py-2 bg-white/10 backdrop-blur-md text-white rounded-xl font-semibold text-sm hover:bg-white/20 flex items-center gap-2 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Quay lại
                    </button>

                    <div className="flex items-center gap-3">
                        {/* Auto check-in toggle */}
                        <button
                            onClick={() => setAutoCheckInMode(!autoCheckInMode)}
                            className={`px-4 py-2 backdrop-blur-md rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${autoCheckInMode
                                ? 'bg-emerald-500/80 text-white'
                                : 'bg-white/10 text-white/70'
                                }`}
                        >
                            <div className={`w-4 h-4 rounded-full border-2 ${autoCheckInMode ? 'bg-white border-white' : 'border-white/50'}`}>
                                {autoCheckInMode && <div className="w-full h-full rounded-full bg-emerald-500 scale-50" />}
                            </div>
                            Auto Check-in
                        </button>

                        {event && (
                            <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-xl flex items-center gap-2">
                                <p className="text-white text-sm font-bold">{event.name}</p>
                                <span className="text-white/50 text-xs">|</span>
                                <span className="text-white/90 text-xs font-medium">{sensitivity}% độ nhạy</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sensitivity Slider Control - Absolute positioned at bottom center */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 w-64 md:w-80">
                    <div className="bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-lg">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-white/90 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                Độ nhạy nhận diện
                            </label>
                            <span className={`text-sm font-bold ${sensitivity < 35 ? 'text-green-400' : (sensitivity > 50 ? 'text-amber-400' : 'text-blue-400')}`}>
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
                            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                        />
                        <div className="flex justify-between mt-1 text-[10px] text-white/40 font-medium">
                            <span>Dễ (20%)</span>
                            <span>Chuẩn (35-45%)</span>
                            <span>Khắt khe (80%)</span>
                        </div>
                    </div>
                </div>

                {/* Advanced Settings Controls - Bottom Right */}
                {/* Advanced Settings Controls REMOVED - Managed in Event Settings */}

                {/* Main Camera View */}
                <div className="w-full h-full relative bg-black overflow-hidden group flex items-center justify-center">
                    {/* Video - object-contain to show full view without zoom/crop, NO mirror flip */}
                    <video ref={videoRef} autoPlay playsInline muted className="max-w-full max-h-full object-contain bg-black" />
                    {/* Ensure canvas matches video size visually */}
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />

                    {/* Face Frame with progress */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative">
                            <div className={`w-72 h-80 border-4 rounded-[2.5rem] transition-all duration-300 ${isProcessing ? 'border-indigo-500 scale-105 animate-pulse' :
                                faceDetected ? 'border-emerald-400 shadow-[0_0_60px_rgba(52,211,153,0.3)]' : 'border-white/40'
                                }`}>
                                <div className={`absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 rounded-tl-3xl transition-colors ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                                <div className={`absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 rounded-tr-3xl transition-colors ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                                <div className={`absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 rounded-bl-3xl transition-colors ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                                <div className={`absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 rounded-br-3xl transition-colors ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                            </div>

                            {/* Auto check-in progress bar */}
                            {autoCheckInMode && faceDetected && faceStableTime > 0 && !isProcessing && !result && (
                                <div className="absolute -bottom-8 left-0 right-0">
                                    <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-150"
                                            style={{ width: `${Math.min((faceStableTime / 3000) * 100, 100)}%` }}
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
                    </div>

                    {/* Status badges */}
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                        <div className={`px-5 py-2 rounded-full backdrop-blur-md text-white text-sm font-bold shadow-lg ${event?.require_face ? 'bg-indigo-600/80' : 'bg-emerald-600/80'
                            }`}>
                            {event?.require_face ? (
                                <span className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                    Xác nhận khuôn mặt
                                </span>
                            ) : 'Check-in nhanh'}
                        </div>

                        {isLoadingModels && (
                            <div className="px-4 py-2 bg-amber-500/80 backdrop-blur-md rounded-full text-white text-xs font-bold animate-pulse flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Đang tải AI...
                            </div>
                        )}

                        {modelsReady && event?.require_face && (
                            <div className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${multipleFaces ? 'bg-red-500/90 text-white animate-pulse' :
                                faceDetected ? 'bg-emerald-500/80 text-white scale-105' : 'bg-orange-500/80 text-white'
                                }`}>
                                {multipleFaces ? (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Chỉ 1 người trong khung hình!
                                    </>
                                ) : faceDetected ? (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Đã nhận diện khuôn mặt
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        Đưa khuôn mặt vào khung
                                    </>
                                )}
                            </div>
                        )}

                        {/* Recognized Person Badge */}
                        {recognizedPerson && faceDetected && !isProcessing && (
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
                        {faceDetected && facesLoaded && !recognizedPerson && !isProcessing && (
                            <div className="px-4 py-2 bg-amber-500/90 rounded-full text-white text-xs font-bold flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Không nhận ra - không có trong danh sách sự kiện
                            </div>

                        )}

                        {/* Already Checked-in Warning */}
                        {faceDetected && facesLoaded && recognizedPerson && checkinCooldowns.has(recognizedPerson.id) &&
                            (Date.now() - (checkinCooldowns.get(recognizedPerson.id) || 0) < COOLDOWN_PERIOD) && (
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
                        !autoCheckInMode && (
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                                <button
                                    onClick={handleCheckIn}
                                    disabled={isProcessing || (event?.require_face && !faceDetected)}
                                    className={`px-12 py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all transform ${isProcessing
                                        ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                                        : faceDetected || !event?.require_face
                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:scale-105 hover:shadow-emerald-500/50'
                                            : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    {isProcessing ? (
                                        <span className="flex items-center gap-3">
                                            <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                                            Đang xử lý...
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-3">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            CHECK-IN NGAY
                                        </span>
                                    )}
                                </button>
                            </div>
                        )
                    }
                </div>
            </div>

            {/* Right Side - Info Panel */}
            <div className="w-96 bg-slate-800/95 backdrop-blur-xl p-6 flex flex-col border-l border-slate-700">
                {/* Event Info */}
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 mb-6 shadow-lg">
                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <p className="text-indigo-200 text-sm font-medium">Sự kiện</p>
                            <h2 className="text-white text-xl font-black">{event?.name}</h2>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${event?.require_face ? 'bg-white/20 text-white' : 'bg-emerald-400/20 text-emerald-300'
                            }`}>
                            {event?.require_face ? 'Face ID' : 'QR'}
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
                            {event?.start_time ? new Date(event.start_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </span>
                    </div>
                </div>

                {/* Recent Check-ins */}
                <div className="flex-1 overflow-hidden">
                    <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Check-in gần đây</h3>
                    <div className="space-y-3 overflow-y-auto max-h-[400px]">
                        {recentCheckins.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <p className="text-sm">Chưa có ai check-in</p>
                                <p className="text-xs text-slate-600 mt-1">Đưa khuôn mặt vào khung để bắt đầu</p>
                            </div>
                        ) : (
                            recentCheckins.map((item, idx) => (
                                <div key={idx} className={`flex items-center gap-3 rounded-xl p-3 transition-all ${idx === 0 ? 'bg-emerald-900/50 border border-emerald-700/50 animate-slide-in' : 'bg-slate-700/50'
                                    }`}>
                                    {item.image ? (
                                        <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                            {item.name.charAt(0)}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold truncate">{item.name}</p>
                                        <p className="text-slate-400 text-xs">{item.time}</p>
                                    </div>
                                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${item.status === 'on_time'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                        }`}>
                                        {item.status === 'on_time' ? '✓ Đúng giờ' : '⚠ Muộn'}
                                    </span>
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
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
                .animate-scale-in { animation: scale-in 0.4s ease-out; }
                .animate-bounce-once { animation: bounce-once 0.5s ease-out; }
                .animate-float { animation: float 3s ease-in-out infinite; }
                .animate-shrink { animation: shrink 4s linear forwards; }
                .animate-slide-in { animation: slide-in 0.3s ease-out; }
            `}</style>
        </div >
    );
};

export default CheckinPage;
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
    const [sensitivity, setSensitivity] = useState(55); // Default 55% (Khắt khe hơn để tránh ghost)

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
    const [recognizedPerson, setRecognizedPerson] = useState<{ id: string; name: string; confidence: number } | null>(null);

    // Dynamic Face Tracking Box State
    const [faceBox, setFaceBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

    // Smart Alert State - Prevent repetitive "Already Checked In" alerts
    const [lastReportedCheckinId, setLastReportedCheckinId] = useState<string | null>(null);
    const lastReportedCheckinIdRef = useRef<string | null>(null);

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
                            // ALWAYS compute from image to ensure using correct model (ssdMobilenetv1)
                            // Previously stored descriptors may be from different model (TinyFaceDetector)

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
    }, [event?.id, modelsReady]);

    // OPTIMIZED: Load existing check-ins (limit 15)
    useEffect(() => {
        if (!event?.id) return;

        const loadCheckins = async () => {
            try {
                // Get checkins from API
                const result = await dataService.getEventCheckins(event.id);
                if (result.success && result.data) {
                    const mapped = result.data.slice(0, 15).map(c => ({
                        name: c.participants?.full_name || 'Unknown',
                        time: new Date(c.checkin_time).toLocaleTimeString('vi-VN'),
                        image: c.participants?.avatar_url,
                        status: c.status,
                        // Extra fields for details modal
                        student_code: c.participants?.student_code || 'N/A',
                        organization: c.participants?.organization || 'N/A',
                        birth_date: c.participants?.birth_date ? new Date(c.participants.birth_date).toLocaleDateString('vi-VN') : 'N/A',
                        points: c.points_earned
                    }));
                    setRecentCheckins(mapped);
                    console.log(`📋 Loaded ${mapped.length} recent check-ins`);
                }
            } catch (err) {
                console.error('Failed to load check-ins:', err);
            }
        };

        loadCheckins();

        // Subscribe to realtime changes (optional but good)
        // For now, simpler to just load once
    }, [event?.id]);
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

            // Skip if already processing or attempted check-in
            if (isProcessing || checkInAttempted) {
                setTimeout(() => {
                    animationId = requestAnimationFrame(detectLoop);
                }, 500);
                return;
            }

            try {
                const detections = await faceService.detectFaces(videoRef.current);

                // --- STRICT FACE SELECTION LOGIC ---
                // Filter detections to get only the largest face (The main user)
                // This eliminates background ghost faces
                let primaryDetection = null;

                if (detections.length > 0) {
                    // Sort by box area (width * height) descending
                    const sortedDetections = [...detections].sort((a, b) => {
                        const areaA = a.detection.box.width * a.detection.box.height;
                        const areaB = b.detection.box.width * b.detection.box.height;
                        return areaB - areaA; // Largest first
                    });

                    // Only take the largest face
                    primaryDetection = sortedDetections[0];
                }

                // We proceed as if only 1 face exists (the largest one)
                // This effectively ignores other smaller faces
                const faceCount = primaryDetection ? 1 : 0;

                // Get box of the first face and update tracking state
                if (primaryDetection && primaryDetection.detection) {
                    const box = primaryDetection.detection.box;
                    const videoWidth = videoRef.current.videoWidth;
                    const mirroredX = videoWidth - box.x - box.width;

                    setFaceBox({
                        x: mirroredX,
                        y: box.y,
                        width: box.width,
                        height: box.height
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
                    }
                    setFaceDetected(singleFaceDetected);
                    faceDetectedRef.current = singleFaceDetected;

                    // Reset reported ID when face is lost so we can alert again when they return
                    if (!singleFaceDetected) {
                        setLastReportedCheckinId(null);
                    }
                }

                // Try to recognize person
                let currentMatch: { userId: string; name: string; confidence: number } | null = null;

                if (singleFaceDetected && facesLoadedRef.current && primaryDetection) {
                    const descriptor = primaryDetection.descriptor;
                    if (descriptor) {
                        // Get list of already checked-in users to filter out
                        const alreadyCheckedInIds = Array.from(checkinCooldowns.keys()) as string[];

                        // Use HIGHER SENSITIVITY from state (default 40% instead of 30%)
                        // Note: In findMatch, threshold is "minimum confidence to match"
                        // So HIGHER threshold means STRICTER matching
                        const match = faceMatcher.findMatch(descriptor, sensitivity, alreadyCheckedInIds);
                        currentMatch = match;

                        // Check cooldown (double check just in case)
                        if (match) {
                            const lastCheckin = checkinCooldowns.get(match.userId);
                            if (lastCheckin && Date.now() - lastCheckin < COOLDOWN_PERIOD) {
                                // Already checked in - logic to prevent repetitive alerts

                                // Only alert if we haven't reported this user recently in this session (frame loop)
                                if (lastReportedCheckinIdRef.current !== match.userId) {
                                    setRecognizedPerson({ id: match.userId, name: match.name, confidence: match.confidence });

                                    // Show "already checked in" message if not already showing
                                    if (!result) {
                                        setResult({
                                            success: true,
                                            message: `✅ ${match.name} đã check-in sự kiện rồi!`,
                                            userName: match.name
                                        });
                                        // Play sound ONLY ONCE per detection session
                                        // playSound('error'); // Optional: mute sound for duplicate checkins
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
                    }
                    setLastFaceDetectedTime(null);
                    lastFaceDetectedTimeRef.current = null;
                    setFaceStableTime(0);
                    setLastReportedCheckinId(null);
                    lastReportedCheckinIdRef.current = null;
                }

                // AUTO CHECK-IN: After 1 second stable with recognized face
                const lastTime = lastFaceDetectedTimeRef.current;

                // Only auto check-in if NOT recently checked in (cooldown)
                const isCooldown = currentMatch ? checkinCooldowns.has(currentMatch.userId) : false;

                if (autoCheckInMode && singleFaceDetected && currentMatch && lastTime && !checkInAttempted && !isCooldown) {
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
        } else {
            // No face recognized and no fallback allowed for Face ID mode
            setResult({ success: false, message: 'Không xác định được người check-in' });
            return;
        }

        setIsProcessing(true);
        // DISABLED: No longer capturing image for check-in to save generic storage
        const capturedImage = undefined;

        try {
            let faceConfidence = latestRecognizedPerson?.confidence || 0;
            let faceVerified = true; // Always verified if we got here via face recognition

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

            const checkinResult = await dataService.checkin({
                event_id: event.id,
                user_id: checkInUserId,
                face_confidence: faceConfidence,
                face_verified: faceVerified,
                checkin_mode: event.checkin_mode || 'student'
            });

            if (checkinResult.success && checkinResult.data) {
                playSound('success');
                console.log('Check-in SUCCESS:', checkinResult);

                // Find participant to get avatar
                const participant = participants.find(p => p.id === checkInUserId);
                const displayAvatar = participant?.avatar_url || undefined;

                setResult({
                    success: true,
                    message: `Check-in lúc ${new Date().toLocaleTimeString('vi-VN')}${latestRecognizedPerson ? ` (${Math.round(latestRecognizedPerson.confidence)}% match)` : ''}`,
                    checkin: checkinResult.data.checkin,
                    capturedImage: displayAvatar, // Use avatar for success screen
                    userName: checkInUserName
                });

                // Update recent checkins list for right sidebar
                setRecentCheckins(prev => [{
                    name: checkInUserName,
                    time: new Date().toLocaleTimeString('vi-VN'),
                    image: displayAvatar, // Use avatar
                    status: checkinResult.data.checkin.status,
                    full_name: participant?.full_name, // Add these for details
                    organization: participant?.organization,
                    student_code: (participant as any).student_code, // Cast if needed or update interface
                    birth_date: participant?.birth_date
                } as any, ...prev.slice(0, 9)]); // Keep last 10

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
                        setLastFaceDetectedTime(null);
                        setFaceStableTime(0);
                    }, 3000);
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
            <div className="flex-1 relative h-screen">
                {/* Header - Mobile Responsive */}
                <div className="absolute top-0 left-0 right-0 z-10 p-2 md:p-4 flex justify-between items-center">
                    <button onClick={onBack} className="px-3 py-2 bg-white/10 backdrop-blur-md text-white rounded-xl font-semibold text-xs md:text-sm hover:bg-white/20 flex items-center gap-1 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="hidden md:inline">Quay lại</span>
                    </button>

                    <div className="flex items-center gap-2">
                        {/* Auto check-in toggle */}
                        <button
                            onClick={() => setAutoCheckInMode(!autoCheckInMode)}
                            className={`px-3 py-2 backdrop-blur-md rounded-xl font-semibold text-xs transition-all flex items-center gap-1 ${autoCheckInMode
                                ? 'bg-emerald-500/80 text-white'
                                : 'bg-white/10 text-white/70'
                                }`}
                        >
                            <div className={`w-3 h-3 rounded-full border-2 ${autoCheckInMode ? 'bg-white border-white' : 'border-white/50'}`} />
                            <span className="hidden md:inline">Auto</span>
                        </button>

                        {event && (
                            <div className="bg-white/10 backdrop-blur-md px-2 py-1 rounded-xl">
                                <p className="text-white text-xs font-bold truncate max-w-[100px] md:max-w-none">{event.name}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sensitivity Slider - Mobile Friendly */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 w-[90%] max-w-xs">
                    <div className="bg-black/60 backdrop-blur-md rounded-xl p-3 border border-white/10">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-white/70 text-xs">Độ nhạy</span>
                            <span className={`text-sm font-bold ${sensitivity < 35 ? 'text-green-400' : 'text-blue-400'}`}>
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
                            className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                    </div>
                </div>

                {/* Advanced Settings Controls - Bottom Right */}
                {/* Advanced Settings Controls REMOVED - Managed in Event Settings */}

                {/* Main Camera View - FULLSCREEN */}
                <div className="w-full h-full relative bg-black overflow-hidden">
                    {/* Video - FULLSCREEN with object-cover */}
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />
                    {/* Hidden canvas for image capture */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Auto check-in progress bar */}
                    {autoCheckInMode && faceDetected && faceStableTime > 0 && !isProcessing && !result && (
                        <div className="absolute -bottom-8 left-0 right-0">
                            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-150"
                                    style={{ width: `${Math.min((faceStableTime / 1000) * 100, 100)}%` }}
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
                {faceBox && (
                    <div
                        className={`absolute border-4 rounded-xl transition-all duration-100 ease-linear ${isProcessing ? 'border-indigo-500 animate-pulse' :
                            faceDetected ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]' : 'border-white/40'
                            }`}
                        style={{
                            top: `${faceBox.y}px`,
                            left: `${faceBox.x}px`,
                            width: `${faceBox.width}px`,
                            height: `${faceBox.height}px`
                        }}
                    >
                        {/* Tracking Corners */}
                        <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 rounded-tl-lg ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                        <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 rounded-tr-lg ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                        <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 rounded-bl-lg ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 rounded-br-lg ${faceDetected ? 'border-emerald-400' : 'border-indigo-400'}`} />

                        {/* Auto check-in progress (attached to moving box) */}
                        {autoCheckInMode && faceDetected && faceStableTime > 0 && !isProcessing && !result && (
                            <div className="absolute -bottom-6 left-0 right-0">
                                <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden backdrop-blur-sm">
                                    <div
                                        className="h-full bg-emerald-400 rounded-full transition-all duration-150"
                                        style={{ width: `${Math.min((faceStableTime / 1000) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Admin/Debug Info - Confidence Score */}
                        {recognizedPerson && (
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/50 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white font-mono">
                                {Math.round(recognizedPerson.confidence)}%
                            </div>
                        )}
                    </div>
                )}

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

            {/* Right Side - Info Panel (HIDDEN ON MOBILE) */}
            <div className="hidden md:flex w-96 bg-slate-800/95 backdrop-blur-xl p-6 flex-col border-l border-slate-700">
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
                                <p className="text-indigo-300 font-medium mb-1">{selectedUser.student_code} • {selectedUser.organization}</p>
                                <p className="text-slate-400 text-sm mb-4">{selectedUser.birth_date !== 'N/A' ? `NS: ${selectedUser.birth_date}` : ''}</p>

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
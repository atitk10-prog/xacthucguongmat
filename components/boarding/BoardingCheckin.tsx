import React, { useState, useRef, useEffect } from 'react';
import { dataService, CheckinType } from '../../services/dataService';
import { faceService } from '../../services/faceService';
import { User, BoardingCheckin as BoardingCheckinType } from '../../types';

interface BoardingCheckinProps {
    currentUser?: User; // Keep purely for prop compatibility, though we load all users now
    onBack?: () => void;
}

const BoardingCheckin: React.FC<BoardingCheckinProps> = ({ onBack }) => {
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const checkinCooldownsRef = useRef<Map<string, number>>(new Map());
    const lastFaceDetectedTimeRef = useRef<number | null>(null);
    const recognizedPersonRef = useRef<{ id: string; name: string; confidence: number } | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const isProcessingRef = useRef(false);

    // State
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedType, setSelectedType] = useState<CheckinType>('morning_in');
    const [modelsReady, setModelsReady] = useState(false);
    const [studentsLoaded, setStudentsLoaded] = useState(false);
    const [faceDetected, setFaceDetected] = useState(false);
    const [detectedPerson, setDetectedPerson] = useState<{ name: string; confidence: number } | null>(null);

    // Results
    const [result, setResult] = useState<{ success: boolean; message: string; data?: BoardingCheckinType; user?: User } | null>(null);
    const [recentCheckins, setRecentCheckins] = useState<Array<{ name: string; time: string; type: string; status: string; avatar?: string }>>([]);

    // Sync ref
    useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

    // Initialize Audio
    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        return () => { audioContextRef.current?.close(); };
    }, []);

    const playSound = (type: 'success' | 'error') => {
        try {
            const ctx = audioContextRef.current;
            if (!ctx) return;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            if (type === 'success') {
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
                oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
                gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.3);
            } else {
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(150, ctx.currentTime);
                gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.3);
            }
        } catch (e) { console.error('Audio error', e); }
    };

    // Auto-select type based on time
    useEffect(() => {
        const h = new Date().getHours();
        if (h >= 5 && h < 11) setSelectedType('morning_in');
        else if (h >= 11 && h < 12) setSelectedType('noon_in'); // 11h-12h
        else if (h >= 12 && h < 14) setSelectedType('noon_out'); // 12h-14h
        else if (h >= 14 && h < 18) setSelectedType('evening_in'); // Afternoon class? Or just reuse evening
        else if (h >= 18) setSelectedType('evening_out'); // Night
        else setSelectedType('morning_in');
    }, []);

    // Load Models & Students
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Load Face Models
                await faceService.loadModels();
                setModelsReady(true);

                // 2. Load Students
                const response = await dataService.getAllStudentsForCheckin();
                if (response.success && response.data) {
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
                    console.log(`Loaded ${count} student faces`);
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

    // Detect Loop
    useEffect(() => {
        if (!modelsReady || !studentsLoaded || !videoRef.current) return;

        let animationId: number;
        let lastDetectionTime = 0;
        const DETECTION_INTERVAL = 150; // Throttling

        const loop = async () => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
                animationId = requestAnimationFrame(loop);
                return;
            }

            // Block if processing
            if (isProcessingRef.current) {
                setTimeout(() => { animationId = requestAnimationFrame(loop); }, 200);
                return;
            }

            // Throttle
            if (Date.now() - lastDetectionTime < DETECTION_INTERVAL) {
                animationId = requestAnimationFrame(loop);
                return;
            }
            lastDetectionTime = Date.now();

            try {
                const detections = await faceService.detectFaces(videoRef.current);

                // Get largest face
                let primaryDetection = null;
                if (detections.length > 0) {
                    primaryDetection = detections.sort((a, b) =>
                        (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height)
                    )[0];
                }

                const hasFace = !!primaryDetection;
                setFaceDetected(hasFace);

                if (hasFace && primaryDetection) {
                    // Match
                    const match = faceService.faceMatcher.findMatch(primaryDetection.descriptor, 45); // Threshold 45%

                    if (match) {
                        // Stability logic
                        const prev = recognizedPersonRef.current;
                        if (!prev || prev.id !== match.userId) {
                            recognizedPersonRef.current = { id: match.userId, name: match.name, confidence: match.confidence };
                            lastFaceDetectedTimeRef.current = Date.now(); // Reset timer on new person
                            setDetectedPerson({ name: match.name, confidence: match.confidence });
                        }

                        // Check timer (1s stability)
                        const stableTime = Date.now() - (lastFaceDetectedTimeRef.current || Date.now());

                        // Check cooldown
                        const cooldown = checkinCooldownsRef.current.get(match.userId);
                        const isCool = !cooldown || (Date.now() - cooldown > 60000); // 1 min cooldown

                        if (stableTime > 800 && isCool && !isProcessingRef.current) {
                            handleAutoCheckin(match.userId, match.name, match.confidence);
                        }
                    } else {
                        recognizedPersonRef.current = null;
                        setDetectedPerson(null);
                    }
                } else {
                    recognizedPersonRef.current = null;
                    lastFaceDetectedTimeRef.current = null;
                    setDetectedPerson(null);
                }

            } catch (e) { console.error('Detection loop error', e); }

            animationId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(animationId);
    }, [modelsReady, studentsLoaded]);

    const handleAutoCheckin = async (userId: string, name: string, confidence: number) => {
        setIsProcessing(true);
        playSound('success');

        try {
            // Call API
            const response = await dataService.boardingCheckin(userId, selectedType);

            if (response.success) {
                setResult({
                    success: true,
                    message: `Check-in ${getTypeLabel(selectedType)} thành công!`,
                    data: response.data,
                    user: { full_name: name } as any
                });

                // Update recent list
                const now = new Date();
                setRecentCheckins(prev => [{
                    name: name,
                    time: now.toLocaleTimeString('vi-VN'),
                    type: getTypeLabel(selectedType),
                    status: 'success'
                }, ...prev.slice(0, 9)]);

                // Set Cooldown
                checkinCooldownsRef.current.set(userId, Date.now());

                // Auto close modal
                setTimeout(() => {
                    setResult(null);
                    setIsProcessing(false);
                }, 2000);
            } else {
                // Error (e.g. already checking)
                // Just cooldown to prevent spam
                checkinCooldownsRef.current.set(userId, Date.now());
                setIsProcessing(false);
            }
        } catch (e) {
            console.error(e);
            setIsProcessing(false);
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'morning_in': return 'Sáng - Vào';
            case 'morning_out': return 'Sáng - Ra';
            case 'noon_in': return 'Trưa - Vào';
            case 'noon_out': return 'Trưa - Ra';
            case 'evening_in': return 'Tối - Vào';
            case 'evening_out': return 'Tối - Ra';
            default: return type;
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col pt-16 px-4 pb-4 gap-4 lg:flex-row">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-slate-800/80 backdrop-blur-md flex items-center justify-between px-4 z-20 border-b border-white/10">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                    )}
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="bg-indigo-600 p-1.5 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg></span>
                        Check-in Học sinh
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-white/60 text-sm font-mono">{new Date().toLocaleTimeString('vi-VN')}</span>
                </div>
            </div>

            {/* Left: Camera */}
            <div className="flex-1 relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10 group">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />

                {/* Overlay UI */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
                    {/* Status Badge */}
                    <div className="self-center">
                        {isProcessing ? (
                            <div className="bg-indigo-600/90 text-white px-6 py-2 rounded-full font-bold animate-pulse shadow-lg backdrop-blur-sm border border-indigo-400">
                                🔄 Đang xử lý...
                            </div>
                        ) : detectedPerson ? (
                            <div className="bg-emerald-600/90 text-white px-6 py-2 rounded-full font-bold shadow-lg backdrop-blur-sm border border-emerald-400 flex items-center gap-2">
                                <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                                {detectedPerson.name} ({detectedPerson.confidence}%)
                            </div>
                        ) : (
                            <div className="bg-slate-900/60 text-white/70 px-6 py-2 rounded-full text-sm backdrop-blur-sm border border-white/10">
                                📷 Đang tìm khuôn mặt...
                            </div>
                        )}
                    </div>

                    {/* Face Frame */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 border-2 border-white/30 rounded-3xl transition-all duration-300 group-hover:border-white/50">
                        {faceDetected && !isProcessing && (
                            <div className="absolute inset-0 border-4 border-emerald-500 rounded-3xl animate-pulse shadow-[0_0_30px_rgba(16,185,129,0.3)]"></div>
                        )}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                    </div>
                </div>
            </div>

            {/* Right: Controls */}
            <div className="w-full lg:w-96 flex flex-col gap-4">
                {/* Mode Selector */}
                <div className="bg-slate-800/50 backdrop-blur-md p-5 rounded-3xl border border-white/10 shadow-xl">
                    <h3 className="text-white/80 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
                                <div className="text-xs font-bold uppercase mb-1 opacity-70">
                                    {type.includes('morning') ? 'Sáng' : type.includes('noon') ? 'Trưa' : 'Tối'}
                                </div>
                                <div className={`text-lg font-black ${selectedType === type ? 'text-white' : 'text-slate-300'}`}>
                                    {type.includes('in') ? 'Vào ⬇️' : 'Ra ⬆️'}
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
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Vừa Check-in
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {recentCheckins.length === 0 ? (
                            <div className="text-center text-slate-500 py-10 italic">
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
                                    <div className="text-emerald-400">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
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
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 blur-[50px] rounded-full pointer-events-none"></div>

                        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
                            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>

                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">{result.user?.full_name}</h2>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-1 rounded-full inline-block font-bold text-sm mb-6">
                            {result.message}
                        </div>

                        <p className="text-slate-400 text-sm">Cửa sổ sẽ đóng tự động...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoardingCheckin;

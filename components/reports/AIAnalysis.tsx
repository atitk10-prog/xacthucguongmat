import React, { useState, useEffect, useMemo, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { analyzePointData, chatWithData, chatWithStudentData, analyzeStudentBehavior, isAIConfigured } from '../../services/geminiService';
import {
    Sparkles, RefreshCw, Send, Bot, User as UserIcon, Mic, MicOff,
    TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight, Minus,
    AlertTriangle, ShieldCheck, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users, Filter,
    MessageSquare, LayoutDashboard, UserCheck, Clock, XCircle, Award,
    CheckCircle2, AlertCircle, Info, Search, Calendar, FileText
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useToast } from '../ui/Toast';
import { User } from '../../types';

type TabType = 'overview' | 'personal' | 'chat';

// Professional icon components for each alert level
const AlertIcon: React.FC<{ level: string; size?: number }> = ({ level, size = 16 }) => {
    const s = `w-${size === 16 ? 4 : size === 20 ? 5 : 6} h-${size === 16 ? 4 : size === 20 ? 5 : 6}`;
    switch (level) {
        case 'red': return <AlertTriangle className={`${s} text-red-500`} />;
        case 'yellow': return <AlertCircle className={`${s} text-amber-500`} />;
        case 'green': return <CheckCircle2 className={`${s} text-emerald-500`} />;
        case 'star': return <Award className={`${s} text-indigo-500`} />;
        default: return <Info className={`${s} text-slate-400`} />;
    }
};

const ALERT_LABELS: Record<string, string> = { red: 'Cần can thiệp', yellow: 'Cần theo dõi', green: 'Ổn định', star: 'Xuất sắc' };
const ALERT_COLORS: Record<string, string> = {
    red: 'bg-red-50 border-red-200 text-red-800',
    yellow: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    star: 'bg-indigo-50 border-indigo-200 text-indigo-800',
};
const ALERT_DOT_COLORS: Record<string, string> = {
    red: 'bg-red-500',
    yellow: 'bg-amber-500',
    green: 'bg-emerald-500',
    star: 'bg-indigo-500',
};

const TAB_CONFIG: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'personal', label: 'Cá nhân', icon: <UserCheck className="w-4 h-4" /> },
    { key: 'chat', label: 'Chat AI', icon: <MessageSquare className="w-4 h-4" /> },
];

interface Props {
    currentUser: User;
}

const AIAnalysis: React.FC<Props> = ({ currentUser }) => {
    const [tab, setTab] = useState<TabType>('overview');
    const [range, setRange] = useState<'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('week');
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');

    // AI State (overview)
    const [aiAnalysis, setAiAnalysis] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Behavior State (personal tab)
    const [behaviorReport, setBehaviorReport] = useState<any>(null);
    const [behaviorLoading, setBehaviorLoading] = useState(false);
    const [behaviorAI, setBehaviorAI] = useState('');
    const [behaviorAILoading, setBehaviorAILoading] = useState(false);
    const [classFilter, setClassFilter] = useState<string>('');
    const [weeksFilter, setWeeksFilter] = useState(1);
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [alertFilter, setAlertFilter] = useState<string>('all');
    const [studentSearch, setStudentSearch] = useState('');
    const [behaviorDateFrom, setBehaviorDateFrom] = useState('');
    const [behaviorDateTo, setBehaviorDateTo] = useState('');
    const [useDateRange, setUseDateRange] = useState(false);

    // Pagination & Sorting
    const ITEMS_PER_PAGE = 10;
    const [currentPage, setCurrentPage] = useState(1);
    const [sortBy, setSortBy] = useState<'default' | 'points-high' | 'points-low'>('default');

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1); }, [alertFilter, studentSearch, sortBy]);

    // Chat State
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatSending, setChatSending] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);
    const { error: toastError } = useToast();

    // ═══ Session Cache Helpers ═══
    // Lưu kết quả AI vào sessionStorage (mất khi đóng tab, giữ khi chuyển trang)
    const CACHE_PREFIX = 'ai_analysis_';
    const cacheGet = (key: string) => {
        try {
            const raw = sessionStorage.getItem(CACHE_PREFIX + key);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    };
    const cacheSet = (key: string, value: any) => {
        try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch { /* quota exceeded */ }
    };

    // Restore cached data on mount
    useEffect(() => {
        const cachedOverview = cacheGet(`overview_${range}`);
        if (cachedOverview) { setAiAnalysis(cachedOverview); }

        const behaviorKey = `behavior_${classFilter || 'all'}_${weeksFilter}w`;
        const cachedReport = cacheGet(`report_${behaviorKey}`);
        const cachedBehaviorAI = cacheGet(`behaviorAI_${behaviorKey}`);
        if (cachedReport) { setBehaviorReport(cachedReport); }
        if (cachedBehaviorAI) { setBehaviorAI(cachedBehaviorAI); }

        const cachedChat = cacheGet('chat_messages');
        if (cachedChat?.length > 0) { setChatMessages(cachedChat); }
    }, []);

    // Save chat messages when they change
    useEffect(() => {
        if (chatMessages.length > 0) cacheSet('chat_messages', chatMessages);
    }, [chatMessages]);

    const quickQuestions = [
        'Những HS nào cần gặp phụ huynh tuần này?',
        'So sánh tình hình các lớp',
        'HS nào đang cải thiện tốt?',
        'Đề xuất khen thưởng cuối tháng',
        'Nguyên nhân vi phạm phổ biến nhất?',
        'Lớp nào cần chú ý nhất?'
    ];

    const availableClasses = useMemo(() => {
        if (!behaviorReport?.classSummary) return [];
        return behaviorReport.classSummary.map((c: any) => c.className).sort();
    }, [behaviorReport]);

    useEffect(() => {
        if (currentUser.role === 'teacher' && currentUser.organization) {
            setClassFilter(currentUser.organization);
        }
    }, [currentUser]);

    useEffect(() => { loadStats(); }, [range, customDateFrom, customDateTo]);
    useEffect(() => { if (tab === 'personal') loadBehaviorData(); }, [tab, classFilter, weeksFilter, useDateRange, behaviorDateFrom, behaviorDateTo]);
    useEffect(() => { setCurrentPage(1); }, [alertFilter, studentSearch]); // Reset page on filter change

    const overviewCacheKey = () => range === 'custom' ? `overview_custom_${customDateFrom}_${customDateTo}` : `overview_${range}`;

    const loadStats = async () => {
        setIsLoading(true);
        try {
            const opts: any = { range };
            if (range === 'custom' && customDateFrom && customDateTo) {
                opts.startDate = customDateFrom;
                opts.endDate = customDateTo;
            } else if (range === 'custom') {
                setIsLoading(false);
                return; // Wait for dates
            }
            const result = await dataService.getPointStatistics(opts);
            if (result.success) {
                setStats(result.data);
                const cached = cacheGet(overviewCacheKey());
                if (cached) {
                    setAiAnalysis(cached);
                } else if (isAIConfigured() && result.data?.logsCount > 0) {
                    runAIAnalysis(result.data);
                }
            }
        } catch (err) { console.error('Failed to load stats:', err); }
        finally { setIsLoading(false); }
    };

    const runAIAnalysis = async (data: any) => {
        setAiLoading(true); setAiAnalysis('');
        try {
            const result = await analyzePointData(data);
            setAiAnalysis(result);
            cacheSet(overviewCacheKey(), result);
        }
        catch (err: any) { setAiAnalysis('Lỗi: ' + err.message); }
        finally { setAiLoading(false); }
    };

    const behaviorCacheKey = () => {
        if (useDateRange && behaviorDateFrom && behaviorDateTo) {
            return `behavior_${classFilter || 'all'}_${behaviorDateFrom}_${behaviorDateTo}`;
        }
        return `behavior_${classFilter || 'all'}_${weeksFilter}w`;
    };

    const loadBehaviorData = async () => {
        const key = behaviorCacheKey();

        // Check cache
        const cachedReport = cacheGet(`report_${key}`);
        const cachedBehaviorAI = cacheGet(`behaviorAI_${key}`);
        if (cachedReport && cachedBehaviorAI) {
            setBehaviorReport(cachedReport);
            setBehaviorAI(cachedBehaviorAI);
            return;
        }

        // Build options
        const opts: any = { classFilter: classFilter || undefined };
        if (useDateRange && behaviorDateFrom && behaviorDateTo) {
            opts.startDate = behaviorDateFrom;
            opts.endDate = behaviorDateTo;
        } else if (useDateRange) {
            return; // Wait for dates
        } else {
            opts.weeks = weeksFilter;
        }

        setBehaviorLoading(true);
        try {
            const result = await dataService.getStudentBehaviorData(opts);
            if (result.success) {
                setBehaviorReport(result.data);
                cacheSet(`report_${key}`, result.data);
                setCurrentPage(1);

                if (isAIConfigured() && result.data.students?.length > 0) {
                    setBehaviorAILoading(true);
                    try {
                        const aiResult = await analyzeStudentBehavior(result.data);
                        setBehaviorAI(aiResult);
                        cacheSet(`behaviorAI_${key}`, aiResult);
                    }
                    catch (e: any) { setBehaviorAI('Lỗi AI: ' + e.message); }
                    finally { setBehaviorAILoading(false); }
                }
            }
        } catch (err) { console.error('Behavior load error:', err); }
        finally { setBehaviorLoading(false); }
    };

    // Force re-analyze (bypass cache)
    const forceReanalyze = () => {
        if (tab === 'overview') {
            sessionStorage.removeItem(CACHE_PREFIX + overviewCacheKey());
            loadStats();
        } else if (tab === 'personal') {
            const key = behaviorCacheKey();
            sessionStorage.removeItem(CACHE_PREFIX + `report_${key}`);
            sessionStorage.removeItem(CACHE_PREFIX + `behaviorAI_${key}`);
            loadBehaviorData();
        }
    };

    const handleChatSend = async (customQuestion?: string) => {
        const q = (customQuestion || chatInput).trim();
        if (!q || chatSending) return;
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: q }]);
        setChatSending(true);
        try {
            const answer = behaviorReport
                ? await chatWithStudentData(q, behaviorReport, stats, chatMessages)
                : await chatWithData(q, stats, chatMessages);
            setChatMessages(prev => [...prev, { role: 'ai', text: answer }]);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (err: any) {
            setChatMessages(prev => [...prev, { role: 'ai', text: `Lỗi: ${err.message}` }]);
        } finally { setChatSending(false); }
    };

    const micTranscriptRef = useRef('');
    const chatInputRef = useRef(chatInput);
    chatInputRef.current = chatInput;
    const isListeningRef = useRef(false);

    const toggleListening = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { toastError('Trình duyệt không hỗ trợ. Dùng Chrome/Edge.'); return; }

        // If already listening → stop
        if (isListeningRef.current && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.lang = 'vi-VN';
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            micTranscriptRef.current = '';

            recognition.onstart = () => {
                setIsListening(true);
                isListeningRef.current = true;
                micTranscriptRef.current = '';
            };

            recognition.onresult = (event: any) => {
                let finalText = '';
                let interimText = '';
                for (let i = 0; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalText += transcript + ' ';
                    } else {
                        interimText += transcript;
                    }
                }
                const combined = (finalText + interimText).trim();
                if (finalText.trim()) {
                    micTranscriptRef.current = finalText.trim();
                } else if (interimText.trim()) {
                    // Some browsers only give interim, store it too
                    micTranscriptRef.current = interimText.trim();
                }
                // Show real-time in input
                setChatInput(combined);
            };

            recognition.onerror = (e: any) => {
                setIsListening(false);
                isListeningRef.current = false;
                if (e.error === 'no-speech') {
                    toastError('Không nghe thấy giọng nói. Hãy nói to hơn.');
                } else if (e.error === 'not-allowed') {
                    toastError('Vui lòng cấp quyền Microphone trong trình duyệt.');
                } else if (e.error !== 'aborted') {
                    toastError(`Lỗi mic: ${e.error}`);
                }
            };

            recognition.onend = () => {
                setIsListening(false);
                isListeningRef.current = false;
                // Get text from ref (not stale state)
                const text = micTranscriptRef.current.trim() || chatInputRef.current.trim();
                if (text) {
                    setChatInput(text);
                    // Auto-send after small delay
                    setTimeout(() => {
                        handleChatSend(text);
                    }, 300);
                }
            };

            recognitionRef.current = recognition;
            recognition.start();

            // Safety timeout: stop after 15s
            setTimeout(() => {
                if (isListeningRef.current && recognitionRef.current) {
                    try { recognitionRef.current.stop(); } catch {}
                }
            }, 15000);
        } catch (err: any) {
            toastError('Lỗi mic: ' + err.message);
            setIsListening(false);
            isListeningRef.current = false;
        }
    };

    // Filtered + searched students
    const filteredStudents = useMemo(() => {
        if (!behaviorReport?.students) return [];
        let list = behaviorReport.students;
        if (alertFilter !== 'all') list = list.filter((s: any) => s.alertLevel === alertFilter);
        if (studentSearch.trim()) {
            const q = studentSearch.toLowerCase();
            list = list.filter((s: any) => s.name.toLowerCase().includes(q) || s.class.toLowerCase().includes(q));
        }
        // Sorting
        if (sortBy === 'points-high') list = [...list].sort((a: any, b: any) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
        else if (sortBy === 'points-low') list = [...list].sort((a: any, b: any) => (a.totalPoints ?? 0) - (b.totalPoints ?? 0));
        return list;
    }, [behaviorReport, alertFilter, studentSearch, sortBy]);

    const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
    const paginatedStudents = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredStudents.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredStudents, currentPage]);

    const summaryCards = useMemo(() => {
        if (!stats) return [];
        return [
            { label: 'Điểm cộng', value: `+${stats.totalAdded || 0}`, prev: stats.prevAdded || 0, color: 'emerald', icon: TrendingUp },
            { label: 'Điểm trừ', value: `-${stats.totalDeducted || 0}`, prev: stats.prevDeducted || 0, color: 'red', icon: TrendingDown },
            { label: 'Lượt ghi nhận', value: stats.logsCount || 0, prev: stats.prevLogsCount || 0, color: 'indigo', icon: BarChart3 },
        ];
    }, [stats]);

    // ═══ Rich AI Text Renderer ═══
    const renderAIText = (text: string, darkMode = false) => {
        // Color legend component
        const ColorLegend = () => (
            <div className={`flex flex-wrap gap-3 mb-3 px-3 py-2 rounded-xl text-xs font-bold ${darkMode ? 'bg-white/5' : 'bg-slate-50 border border-slate-100'}`}>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Cảnh báo / Khiển trách</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Cần theo dõi</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Tích cực / Tuyên dương</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Đề xuất</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Xuất sắc</span>
            </div>
        );

        // Clean inline markers from text
        const cleanText = (str: string) => str
            .replace(/\(\[!\]\)/g, '').replace(/\(\[-\]\)/g, '').replace(/\(\[\+\]\)/g, '')
            .replace(/\(\[>\]\)/g, '').replace(/\(\[\*\]\)/g, '').replace(/\s{2,}/g, ' ').trim();

        // Render bold text
        const renderInline = (str: string) => {
            const cleaned = cleanText(str);
            const parts: React.ReactNode[] = [];
            const boldRegex = /\*\*(.+?)\*\*/g;
            let lastIndex = 0;
            let match;
            while ((match = boldRegex.exec(cleaned)) !== null) {
                if (match.index > lastIndex) parts.push(cleaned.slice(lastIndex, match.index));
                parts.push(<strong key={`b-${match.index}`} className={darkMode ? 'text-white font-black' : 'text-slate-900 font-black'}>{match[1]}</strong>);
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < cleaned.length) parts.push(cleaned.slice(lastIndex));
            return parts.length > 0 ? parts : [cleaned];
        };

        // Marker → section config
        const sectionConfig: Record<string, { banner: string; dot: string; label: string }> = {
            '[!]': { banner: 'bg-red-500', dot: 'bg-red-400', label: 'Cảnh báo' },
            '[CRITICAL]': { banner: 'bg-red-500', dot: 'bg-red-400', label: 'Cảnh báo' },
            '[-]': { banner: 'bg-amber-500', dot: 'bg-amber-400', label: 'Theo dõi' },
            '[CAUTION]': { banner: 'bg-amber-500', dot: 'bg-amber-400', label: 'Theo dõi' },
            '[?]': { banner: 'bg-amber-500', dot: 'bg-amber-400', label: 'Theo dõi' },
            '[+]': { banner: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'Tích cực' },
            '[OK]': { banner: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'Tích cực' },
            '[>]': { banner: 'bg-indigo-500', dot: 'bg-indigo-400', label: 'Đề xuất' },
            '[*]': { banner: 'bg-purple-500', dot: 'bg-purple-400', label: 'Xuất sắc' },
            '[EXCELLENT]': { banner: 'bg-purple-500', dot: 'bg-purple-400', label: 'Xuất sắc' },
        };

        // Detect marker at start of line
        const getLineMarker = (line: string): { marker: string; content: string; config: typeof sectionConfig[string] } | null => {
            for (const [marker, cfg] of Object.entries(sectionConfig)) {
                if (line.startsWith(marker)) {
                    return { marker, content: line.slice(marker.length).trim(), config: cfg };
                }
            }
            return null;
        };

        // Group lines into sections
        const lines = text.split('\n');
        type Section = { type: 'heading'; text: string; level: number } | { type: 'marker-group'; config: typeof sectionConfig[string]; lines: string[] } | { type: 'text'; lines: string[] };
        const sections: Section[] = [];
        let currentMarkerGroup: { config: typeof sectionConfig[string]; lines: string[] } | null = null;
        let currentTextGroup: string[] = [];

        const flushTextGroup = () => {
            if (currentTextGroup.length > 0) {
                sections.push({ type: 'text', lines: [...currentTextGroup] });
                currentTextGroup = [];
            }
        };
        const flushMarkerGroup = () => {
            if (currentMarkerGroup) {
                sections.push({ type: 'marker-group', config: currentMarkerGroup.config, lines: [...currentMarkerGroup.lines] });
                currentMarkerGroup = null;
            }
        };

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                // Empty line → flush groups
                flushMarkerGroup();
                flushTextGroup();
                continue;
            }

            // Heading
            if (trimmed.startsWith('##')) {
                flushMarkerGroup();
                flushTextGroup();
                const level = trimmed.startsWith('###') ? 3 : 2;
                sections.push({ type: 'heading', text: trimmed.replace(/^#{1,4}\s*/, ''), level });
                continue;
            }

            // Marker line
            const markerInfo = getLineMarker(trimmed);
            if (markerInfo) {
                flushTextGroup();
                if (currentMarkerGroup && currentMarkerGroup.config.banner === markerInfo.config.banner) {
                    // Same color group → append
                    currentMarkerGroup.lines.push(markerInfo.content);
                } else {
                    flushMarkerGroup();
                    currentMarkerGroup = { config: markerInfo.config, lines: [markerInfo.content] };
                }
                continue;
            }

            // Regular text
            flushMarkerGroup();
            currentTextGroup.push(trimmed);
        }
        flushMarkerGroup();
        flushTextGroup();

        return (
            <div className="space-y-3">
                <ColorLegend />
                {sections.map((section, i) => {
                    if (section.type === 'heading') {
                        return (
                            <h4 key={i} className={`font-black ${section.level === 2 ? 'text-lg mt-4' : 'text-base mt-3'} ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                                {section.text}
                            </h4>
                        );
                    }

                    if (section.type === 'marker-group') {
                        const cfg = section.config;
                        return (
                            <div key={i} className={`rounded-xl overflow-hidden ${darkMode ? 'border border-white/10' : 'border border-slate-200'}`}>
                                {/* Colored banner header */}
                                <div className={`${cfg.banner} px-4 py-2 flex items-center gap-2`}>
                                    <span className="w-2.5 h-2.5 rounded-full bg-white/80" />
                                    <span className="text-white text-sm font-bold">{cfg.label}</span>
                                </div>
                                {/* Content under banner */}
                                <div className={`px-4 py-3 space-y-1.5 ${darkMode ? 'bg-white/5' : 'bg-white'}`}>
                                    {section.lines.map((line, j) => (
                                        <div key={j} className="flex items-start gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                                            <span className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                                {renderInline(line)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    // Text group
                    return (
                        <div key={i} className="space-y-1">
                            {section.lines.map((line, j) => {
                                // Bullet
                                if (line.startsWith('- ') || line.startsWith('• ')) {
                                    return (
                                        <div key={j} className="flex items-start gap-2 pl-2">
                                            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${darkMode ? 'bg-slate-500' : 'bg-slate-400'}`} />
                                            <span className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{renderInline(line.slice(2))}</span>
                                        </div>
                                    );
                                }
                                // Numbered
                                const numMatch = line.match(/^(\d+)\.\s+(.*)/);
                                if (numMatch) {
                                    return (
                                        <div key={j} className="flex items-start gap-2 pl-1">
                                            <span className={`text-xs font-black mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${darkMode ? 'bg-white/10 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>{numMatch[1]}</span>
                                            <span className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{renderInline(numMatch[2])}</span>
                                        </div>
                                    );
                                }
                                return <p key={j} className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{renderInline(line)}</p>;
                            })}
                        </div>
                    );
                })}
            </div>
        );
    };

    // ═══ Simple AI renderer for Chat & Personal (no banners, just colored dots) ═══
    const renderAISimple = (text: string, darkMode = false) => {
        const cleanText = (str: string) => str
            .replace(/\(\[!\]\)/g, '').replace(/\(\[-\]\)/g, '').replace(/\(\[\+\]\)/g, '')
            .replace(/\(\[>\]\)/g, '').replace(/\(\[\*\]\)/g, '').replace(/\s{2,}/g, ' ').trim();

        const renderInline = (str: string) => {
            const cleaned = cleanText(str);
            const parts: React.ReactNode[] = [];
            const boldRegex = /\*\*(.+?)\*\*/g;
            let lastIndex = 0;
            let match;
            while ((match = boldRegex.exec(cleaned)) !== null) {
                if (match.index > lastIndex) parts.push(cleaned.slice(lastIndex, match.index));
                parts.push(<strong key={`b-${match.index}`} className={darkMode ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{match[1]}</strong>);
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < cleaned.length) parts.push(cleaned.slice(lastIndex));
            return parts.length > 0 ? parts : [cleaned];
        };

        const dotColors: Record<string, string> = {
            '[!]': 'bg-red-500', '[CRITICAL]': 'bg-red-500',
            '[-]': 'bg-amber-500', '[CAUTION]': 'bg-amber-500', '[?]': 'bg-amber-500',
            '[+]': 'bg-emerald-500', '[OK]': 'bg-emerald-500',
            '[>]': 'bg-indigo-500',
            '[*]': 'bg-purple-500', '[EXCELLENT]': 'bg-purple-500',
        };

        const lines = text.split('\n');
        return (
            <div className="space-y-1">
                {lines.map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={i} className="h-1.5" />;

                    // Headings
                    if (trimmed.startsWith('##')) {
                        return <p key={i} className={`font-bold text-sm mt-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{trimmed.replace(/^#{1,4}\s*/, '')}</p>;
                    }

                    // Marker lines → colored dot
                    for (const [marker, dotColor] of Object.entries(dotColors)) {
                        if (trimmed.startsWith(marker)) {
                            const content = trimmed.slice(marker.length).trim();
                            return (
                                <div key={i} className="flex items-start gap-2 pl-1">
                                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
                                    <span className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{renderInline(content)}</span>
                                </div>
                            );
                        }
                    }

                    // Bullet
                    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                        return (
                            <div key={i} className="flex items-start gap-2 pl-3">
                                <span className={`w-1 h-1 rounded-full mt-2 flex-shrink-0 ${darkMode ? 'bg-slate-500' : 'bg-slate-400'}`} />
                                <span className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{renderInline(trimmed.slice(2))}</span>
                            </div>
                        );
                    }

                    // Default
                    return <p key={i} className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{renderInline(trimmed)}</p>;
                })}
            </div>
        );
    };

    if (!isAIConfigured()) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center gap-4">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-700">Chưa cấu hình AI</h3>
                <p className="text-slate-500 max-w-md">Thêm <code className="bg-slate-100 px-2 py-0.5 rounded text-sm">VITE_GROQ_API_KEY</code> vào .env.local</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header + Tabs */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900">AI Phân tích</h2>
                            <p className="text-slate-500 text-sm">{currentUser.role === 'teacher' ? `Lớp ${currentUser.organization || ''}` : 'Toàn trường'}</p>
                        </div>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        {TAB_CONFIG.map(t => (
                            <button key={t.key} onClick={() => setTab(t.key)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${tab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ════════ TAB 1: Overview ════════ */}
            {tab === 'overview' && (
                <>
                    <div className="flex flex-wrap gap-2 items-center">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {([
                            { key: 'day', label: 'Hôm nay' },
                            { key: 'week', label: '7 ngày' },
                            { key: 'month', label: '30 ngày' },
                            { key: 'quarter', label: '3 tháng' },
                            { key: 'year', label: '1 năm' },
                            { key: 'custom', label: 'Tùy chọn' },
                        ] as const).map(r => (
                            <button key={r.key} onClick={() => setRange(r.key)}
                                className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${range === r.key ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}>
                                {r.label}
                            </button>
                        ))}
                        {range === 'custom' && (
                            <div className="flex items-center gap-2 ml-2">
                                <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-200" />
                                <span className="text-slate-400 text-xs">→</span>
                                <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-200" />
                            </div>
                        )}
                    </div>
                    {!isLoading && stats && (
                        <div className="grid grid-cols-3 gap-4">
                            {summaryCards.map((card, i) => {
                                const current = typeof card.value === 'string' ? parseInt(card.value.replace(/[+-]/g, '')) : card.value;
                                const diff = current - card.prev;
                                const Icon = card.icon;
                                return (
                                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`w-9 h-9 bg-${card.color}-100 rounded-xl flex items-center justify-center`}>
                                                <Icon className={`w-5 h-5 text-${card.color}-600`} />
                                            </div>
                                            <span className="text-sm font-medium text-slate-500">{card.label}</span>
                                        </div>
                                        <p className="text-2xl font-black text-slate-900">{card.value}</p>
                                        {card.prev > 0 && (
                                            <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                                {diff !== 0 ? `${Math.abs(diff)} so với kỳ trước` : 'Không đổi'}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-3xl text-white overflow-hidden shadow-xl">
                        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-indigo-400" />
                                <div>
                                    <h3 className="font-black text-sm">Báo cáo phân tích</h3>
                                    <p className="text-slate-400 text-[11px]">
                                        {range === 'day' ? 'Hôm nay' : range === 'week' ? '7 ngày qua' : range === 'month' ? '30 ngày qua' : range === 'quarter' ? '3 tháng qua' : range === 'year' ? '1 năm qua' : `${customDateFrom} → ${customDateTo}`}
                                    </p>
                                </div>
                            </div>
                            <button onClick={forceReanalyze} disabled={aiLoading}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all disabled:opacity-50" title="Phân tích lại (xóa cache)">
                                <RefreshCw className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="p-6 max-h-[500px] overflow-y-auto">
                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center h-32 gap-3">
                                    <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-indigo-300 text-sm font-bold">Đang phân tích...</p>
                                </div>
                            ) : aiAnalysis ? (
                                <div>{renderAIText(aiAnalysis, true)}</div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-32 text-slate-500 gap-2">
                                    <BarChart3 className="w-8 h-8 text-slate-600" />
                                    <p className="text-sm">Chưa có dữ liệu để phân tích</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ════════ TAB 2: Personal ════════ */}
            {tab === 'personal' && (
                <>
                    {/* Filters Bar */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-3 items-center">
                        {currentUser.role === 'admin' && (
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-slate-400" />
                                <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all">
                                    <option value="">Tất cả lớp</option>
                                    {availableClasses.map((c: string) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Time range: toggle between weeks or custom dates */}
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {!useDateRange ? (
                                <select value={weeksFilter} onChange={e => setWeeksFilter(Number(e.target.value))}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 transition-all">
                                    <option value={1}>1 tuần</option>
                                    <option value={2}>2 tuần</option>
                                    <option value={4}>4 tuần</option>
                                    <option value={8}>8 tuần</option>
                                    <option value={12}>3 tháng</option>
                                    <option value={24}>6 tháng</option>
                                    <option value={52}>1 năm</option>
                                </select>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <input type="date" value={behaviorDateFrom} onChange={e => setBehaviorDateFrom(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-200" />
                                    <span className="text-slate-400 text-xs">→</span>
                                    <input type="date" value={behaviorDateTo} onChange={e => setBehaviorDateTo(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-200" />
                                </div>
                            )}
                            <button onClick={() => setUseDateRange(!useDateRange)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${useDateRange ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                                title={useDateRange ? 'Chuyển về tuần' : 'Chọn ngày cụ thể'}>
                                {useDateRange ? 'Tuần' : 'Ngày'}
                            </button>
                        </div>

                        <button onClick={forceReanalyze} disabled={behaviorLoading}
                            className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm">
                            <RefreshCw className={`w-4 h-4 ${behaviorLoading ? 'animate-spin' : ''}`} /> Phân tích lại
                        </button>

                        {/* Search (only when data loaded) */}
                        {behaviorReport && (
                            <div className="flex-1 min-w-[200px] relative ml-auto">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input type="text" value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                                    placeholder="Tìm học sinh..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" />
                            </div>
                        )}
                    </div>

                    {behaviorLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-14 h-14 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                            <div className="text-center">
                                <p className="text-slate-700 font-bold">Đang phân tích hành vi</p>
                                <p className="text-slate-400 text-sm mt-1">
                                    {useDateRange ? `Khoảng ${behaviorDateFrom} → ${behaviorDateTo}` : `Xử lý dữ liệu ${weeksFilter} tuần...`}
                                </p>
                            </div>
                        </div>
                    ) : behaviorReport ? (
                        <>
                            {/* Alert Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { key: 'red', icon: AlertTriangle, label: 'Cần can thiệp', count: behaviorReport.summary.alertRed, bg: 'bg-gradient-to-br from-red-500 to-rose-600', ring: 'ring-red-200' },
                                    { key: 'yellow', icon: AlertCircle, label: 'Cần theo dõi', count: behaviorReport.summary.alertYellow, bg: 'bg-gradient-to-br from-amber-500 to-orange-500', ring: 'ring-amber-200' },
                                    { key: 'green', icon: CheckCircle2, label: 'Ổn định', count: behaviorReport.summary.alertGreen, bg: 'bg-gradient-to-br from-emerald-500 to-green-600', ring: 'ring-emerald-200' },
                                    { key: 'star', icon: Award, label: 'Xuất sắc', count: behaviorReport.summary.alertStar, bg: 'bg-gradient-to-br from-indigo-500 to-purple-600', ring: 'ring-indigo-200' },
                                ].map(a => (
                                    <button key={a.key} onClick={() => setAlertFilter(alertFilter === a.key ? 'all' : a.key)}
                                        className={`bg-white p-4 rounded-2xl border shadow-sm text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${alertFilter === a.key ? `ring-2 ${a.ring} border-transparent` : 'border-slate-100'}`}>
                                        <div className={`w-10 h-10 ${a.bg} rounded-xl flex items-center justify-center mb-2 shadow-sm`}>
                                            <a.icon className="w-5 h-5 text-white" />
                                        </div>
                                        <p className="text-2xl font-black text-slate-900">{a.count}</p>
                                        <p className="text-xs font-medium text-slate-500 mt-0.5">{a.label}</p>
                                    </button>
                                ))}
                            </div>

                            {/* AI Behavior Analysis */}
                            {(behaviorAI || behaviorAILoading) && (
                                <div className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-2xl p-5 text-white shadow-lg">
                                    <h4 className="font-black text-sm mb-3 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-indigo-400" /> Nhận định & Đề xuất từ AI
                                    </h4>
                                    {behaviorAILoading ? (
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-indigo-300 text-sm">Đang phân tích cá nhân hóa...</span>
                                        </div>
                                    ) : (
                                        <div className="max-h-96 overflow-y-auto pr-2">{renderAISimple(behaviorAI, true)}</div>
                                    )}
                                </div>
                            )}

                            {/* Student List */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                    <h4 className="font-black text-slate-800 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-slate-400" />
                                        {alertFilter !== 'all' ? `${ALERT_LABELS[alertFilter]} (${filteredStudents.length})` : `Danh sách học sinh (${filteredStudents.length})`}
                                    </h4>
                                    <div className="flex items-center gap-1">
                                        {/* Sort buttons */}
                                        {[
                                            { key: 'default' as const, label: 'Mặc định' },
                                            { key: 'points-high' as const, label: '↑ Điểm cao' },
                                            { key: 'points-low' as const, label: '↓ Điểm thấp' },
                                        ].map(s => (
                                            <button key={s.key} onClick={() => { setSortBy(s.key); setCurrentPage(1); }}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                    sortBy === s.key
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                }`}>
                                                {s.label}
                                            </button>
                                        ))}
                                        {alertFilter !== 'all' && (
                                            <button onClick={() => setAlertFilter('all')} className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1 ml-2">
                                                <XCircle className="w-3 h-3" /> Bỏ lọc
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {filteredStudents.length === 0 ? (
                                    <div className="bg-white rounded-2xl p-10 text-center border border-slate-100">
                                        <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                        <p className="font-bold text-slate-600">Không tìm thấy học sinh</p>
                                        <p className="text-sm text-slate-400 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                                    </div>
                                ) : paginatedStudents.map((s: any) => (
                                    <div key={s.userId} className={`rounded-2xl border overflow-hidden transition-all ${ALERT_COLORS[s.alertLevel]}`}>
                                        <button onClick={() => setExpandedStudent(expandedStudent === s.userId ? null : s.userId)}
                                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/30 transition-colors">
                                            {/* Status dot + icon */}
                                            <div className="relative flex-shrink-0">
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.alertLevel === 'red' ? 'bg-red-100' : s.alertLevel === 'yellow' ? 'bg-amber-100' : s.alertLevel === 'star' ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                                                    <AlertIcon level={s.alertLevel} />
                                                </div>
                                                <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${ALERT_DOT_COLORS[s.alertLevel]} border-2 border-white`}></div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm truncate">{s.name}</p>
                                                <div className="flex items-center gap-2 text-[11px] opacity-70">
                                                    <span>{s.class}</span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-0.5">
                                                        {s.trend === 'improving' ? <TrendingUp className="w-3 h-3" /> : s.trend === 'declining' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                                        {s.trendDetail}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-sm font-black">{s.totalPoints}đ</p>
                                                <div className="flex items-center gap-2 text-[10px] opacity-60">
                                                    <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {s.totalLate}</span>
                                                    <span className="flex items-center gap-0.5"><XCircle className="w-2.5 h-2.5" /> {s.totalAbsent}</span>
                                                </div>
                                            </div>
                                            {expandedStudent === s.userId ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                                        </button>

                                        {expandedStudent === s.userId && (
                                            <div className="px-4 pb-4 border-t border-current/10 pt-3 space-y-3">
                                                {/* Stats row */}
                                                <div className="grid grid-cols-4 gap-2">
                                                    {[
                                                        { label: 'Cộng', value: `+${s.totalAdded}`, color: 'text-emerald-600', icon: TrendingUp },
                                                        { label: 'Trừ', value: `-${s.totalDeducted}`, color: 'text-red-600', icon: TrendingDown },
                                                        { label: 'Muộn', value: s.totalLate, color: 'text-amber-600', icon: Clock },
                                                        { label: 'Vắng', value: s.totalAbsent, color: 'text-slate-600', icon: XCircle },
                                                    ].map((stat, si) => (
                                                        <div key={si} className="bg-white/60 rounded-xl p-2.5 text-center">
                                                            <stat.icon className={`w-3.5 h-3.5 mx-auto mb-1 ${stat.color}`} />
                                                            <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
                                                            <p className="text-[10px] font-bold opacity-60">{stat.label}</p>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Alert reasons */}
                                                {s.alertReasons.length > 0 && (
                                                    <div className="bg-white/40 rounded-xl p-3 space-y-1.5">
                                                        <p className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" /> Lý do cảnh báo
                                                        </p>
                                                        {s.alertReasons.map((r: string, i: number) => (
                                                            <p key={i} className="text-xs flex items-center gap-1.5">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${ALERT_DOT_COLORS[s.alertLevel]} flex-shrink-0`}></span>
                                                                {r}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Repeated violations */}
                                                {s.repeatedViolations.length > 0 && (
                                                    <div className="bg-white/40 rounded-xl p-3 space-y-1.5">
                                                        <p className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1">
                                                            <ShieldCheck className="w-3 h-3" /> Vi phạm lặp lại
                                                        </p>
                                                        {s.repeatedViolations.map((v: any, i: number) => (
                                                            <p key={i} className="text-xs flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"></span>
                                                                {v.reason} <span className="font-bold opacity-80">({v.count} lần)</span>
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Weekly trend chart */}
                                                {s.weeklyTrend.length > 1 && (
                                                    <div className="bg-white/60 rounded-xl p-3">
                                                        <p className="text-[10px] font-bold uppercase opacity-50 mb-2 flex items-center gap-1">
                                                            <BarChart3 className="w-3 h-3" /> Biểu đồ xu hướng
                                                        </p>
                                                        <div style={{ height: 140 }}>
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <LineChart data={s.weeklyTrend}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                                    <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                                                                    <YAxis tick={{ fontSize: 9 }} width={30} />
                                                                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px', border: '1px solid #e2e8f0' }} />
                                                                    <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                                                                    <Line type="monotone" dataKey="pointsDeducted" stroke="#ef4444" strokeWidth={2} name="Điểm trừ" dot={{ r: 3 }} />
                                                                    <Line type="monotone" dataKey="lateCount" stroke="#f59e0b" strokeWidth={2} name="Đi muộn" dot={{ r: 3 }} />
                                                                    <Line type="monotone" dataKey="pointsAdded" stroke="#22c55e" strokeWidth={2} name="Điểm cộng" dot={{ r: 3 }} />
                                                                </LineChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100">
                                        <p className="text-xs text-slate-500">
                                            Hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredStudents.length)} / {filteredStudents.length} học sinh
                                        </p>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                                <ChevronLeft className="w-4 h-4 text-slate-600" />
                                            </button>
                                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                                .map((p, i, arr) => (
                                                    <React.Fragment key={p}>
                                                        {i > 0 && arr[i - 1] !== p - 1 && <span className="text-slate-300 text-xs px-1">...</span>}
                                                        <button onClick={() => setCurrentPage(p)}
                                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === p ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                            {p}
                                                        </button>
                                                    </React.Fragment>
                                                ))}
                                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                                <ChevronRight className="w-4 h-4 text-slate-600" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-2xl p-14 text-center border border-slate-100 shadow-sm">
                            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <UserCheck className="w-8 h-8 text-indigo-400" />
                            </div>
                            <p className="font-bold text-slate-700 text-lg">Phân tích hành vi cá nhân</p>
                            <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">Chọn khoảng thời gian và nhấn "Phân tích" để AI đánh giá từng học sinh</p>
                        </div>
                    )}
                </>
            )}

            {/* ════════ TAB 3: Chat ════════ */}
            {tab === 'chat' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col" style={{ height: '70vh' }}>
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                                <Bot className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-black text-sm text-slate-800">Hỏi đáp AI</h3>
                                <p className="text-[11px] text-slate-400">
                                    {behaviorReport ? `Dữ liệu ${behaviorReport.summary.totalStudents} HS, ${behaviorReport.weeksAnalyzed} tuần` : 'Dữ liệu tổng hợp'}
                                </p>
                            </div>
                        </div>
                        {chatMessages.length > 0 && (
                            <button onClick={() => { setChatMessages([]); sessionStorage.removeItem(CACHE_PREFIX + 'chat_messages'); }} className="text-xs text-slate-400 hover:text-red-500 font-bold flex items-center gap-1 transition-colors">
                                <XCircle className="w-3.5 h-3.5" /> Xóa lịch sử
                            </button>
                        )}
                    </div>

                    {chatMessages.length === 0 && (
                        <div className="p-4 border-b border-slate-100">
                            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Gợi ý câu hỏi
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {quickQuestions.map((q, i) => (
                                    <button key={i} onClick={() => handleChatSend(q)}
                                        className="px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-xs rounded-full border border-slate-200 hover:border-indigo-200 transition-all font-medium">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {chatMessages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
                                <Bot className="w-8 h-8 text-slate-300" />
                                <p className="text-sm">Hỏi bất kỳ điều gì về dữ liệu...</p>
                            </div>
                        )}
                        {chatMessages.map((msg, i) => (
                            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'ai' && (
                                    <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-4 h-4 text-indigo-600" />
                                    </div>
                                )}
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'}`}>
                                    <div>{msg.role === 'ai' ? renderAISimple(msg.text, false) : <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>}</div>
                                </div>
                                {msg.role === 'user' && (
                                    <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                                        <UserIcon className="w-4 h-4 text-emerald-600" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {chatSending && (
                            <div className="flex gap-2">
                                <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center"><Bot className="w-4 h-4 text-indigo-600" /></div>
                                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-3 border-t border-slate-100 flex gap-2">
                        <button onClick={toggleListening}
                            className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}
                            title={isListening ? 'Đang nghe... nhấn để dừng' : 'Nhấn để nói'}>
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                        <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChatSend()}
                            placeholder={isListening ? 'Đang nghe...' : 'Nhập câu hỏi...'}
                            className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                            disabled={chatSending} />
                        <button onClick={() => handleChatSend()} disabled={chatSending || !chatInput.trim()}
                            className="px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all flex items-center disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIAnalysis;

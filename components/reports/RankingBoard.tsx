import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { utils, writeFile } from 'xlsx';
import { Award, Download, Loader2, FileDown, Plus, ChevronRight, Settings2, CheckCircle2, X, ArrowLeft } from 'lucide-react';
import { generateSingleExportPDF, generateBatchPDF } from '../../services/certificateExportService';
import { useToast } from '../ui/Toast';

interface RankingUser {
    position: number;
    user_id: string;
    user_name: string;
    avatar_url?: string;
    class_id?: string;
    organization?: string;
    total_points: number;
    on_time_count?: number;
    late_count?: number;
    absent_count?: number;
    rank?: string;
    // Class stats
    student_count?: number;
    average_points?: number;
}

interface RankingBoardProps {
    type?: 'student' | 'class';
    classId?: string;
    roomId?: string;
}

const RankingBoard: React.FC<RankingBoardProps> = ({ type = 'student', classId, roomId }) => {
    const [rankings, setRankings] = useState<RankingUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMoreLoading, setIsMoreLoading] = useState(false);
    const [viewType, setViewType] = useState<'student' | 'class'>(type);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentUserRole, setCurrentUserRole] = useState<string>('student');
    const [filterClass, setFilterClass] = useState<string | null>(null);
    const { success, error: toastError } = useToast();

    // Certificate Content Editor State
    const [showCertEditor, setShowCertEditor] = useState(false);
    const [selectedUserForCert, setSelectedUserForCert] = useState<RankingUser | null>(null);
    const [certConfig, setCertConfig] = useState({
        title: 'Chứng nhận Xuất Sắc',
        presentedTo: 'Trao tặng cho',
        eventPrefix: 'Đã đạt thành tích xuất sắc trong phong trào nề nếp',
        datePrefix: 'Ngày cấp:',
        signature: 'Ban Tổ Chức',
        font: 'serif',
        issuedDate: new Date().toLocaleDateString('vi-VN')
    });

    useEffect(() => {
        const user = dataService.getStoredUser();
        if (user) setCurrentUserRole(user.role);
    }, []);

    useEffect(() => {
        setPage(0);
        setRankings([]);
        loadRankings(0, true);
    }, [viewType, classId, roomId, filterClass]);

    const loadRankings = async (pageNum: number, isNew: boolean = false) => {
        if (isNew) setIsLoading(true);
        else setIsMoreLoading(true);

        try {
            // If filterClass is active, force type to 'student' to show students of that class
            const typeToFetch = filterClass ? 'student' : viewType;

            const result = await dataService.getRanking({
                type: typeToFetch,
                role: 'student',
                limit: 20,
                page: pageNum,
                organization: filterClass || undefined
            });

            if (result.success && result.data) {
                const rawData = result.data as any[];
                setHasMore(rawData.length === 20);

                const mappedData = rawData.map((item, index) => {
                    // Determine classification
                    let classification = 'Chưa xếp loại';
                    const pointsToUse = typeToFetch === 'student' ? item.total_points : item.average_points;

                    if (pointsToUse >= 90) classification = 'Tốt';
                    else if (pointsToUse >= 70) classification = 'Khá';
                    else if (pointsToUse >= 50) classification = 'Trung bình';
                    else if (pointsToUse > 0) classification = 'Yếu';

                    return {
                        position: item.rank,
                        user_id: item.id,
                        user_name: item.full_name,
                        avatar_url: item.avatar_url,
                        class_id: item.class_id,
                        organization: item.organization,
                        total_points: item.total_points,
                        on_time_count: item.on_time_count,
                        late_count: item.late_count,
                        absent_count: item.absent_count,
                        student_count: item.student_count,
                        average_points: item.average_points,
                        rank: classification
                    };
                });

                if (isNew) setRankings(mappedData);
                else setRankings(prev => [...prev, ...mappedData]);
            }
        } catch (error) {
            console.error('Failed to load rankings:', error);
        } finally {
            setIsLoading(false);
            setIsMoreLoading(false);
        }
    };

    const handleClassClick = (className: string) => {
        setFilterClass(className);
        // viewType remains 'class' conceptually, but we render lists
        // Actually, we rely on filterClass to toggle render logic logic in loadRankings
    };

    const handleBackToClasses = () => {
        setFilterClass(null);
    };

    const handleExport = () => {
        const wb = utils.book_new();
        const dataToExport = rankings.map(r => ({
            'Hạng': r.position,
            'Họ và tên': r.user_name,
            'Lớp': r.class_id || 'N/A',
            'Đúng giờ': r.on_time_count || 0,
            'Muộn': r.late_count || 0,
            'Vắng': r.absent_count || 0,
            'Tổng điểm': r.total_points,
            'Xếp loại': r.rank || 'N/A'
        }));
        const ws = utils.json_to_sheet(dataToExport);
        utils.book_append_sheet(wb, ws, "BangXepHangNeNep");
        writeFile(wb, "BangXepHangNeNep.xlsx");
    };

    const MedalIcons = {
        gold: (
            <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">1</text>
            </svg>
        ),
        silver: (
            <svg className="w-7 h-7 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">2</text>
            </svg>
        ),
        bronze: (
            <svg className="w-7 h-7 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">3</text>
            </svg>
        )
    };

    const getMedalEmoji = (position: number): React.ReactNode => {
        if (position === 1) return MedalIcons.gold;
        if (position === 2) return MedalIcons.silver;
        if (position === 3) return MedalIcons.bronze;
        return <span className="text-slate-400 text-sm font-bold">#{position}</span>;
    };

    const getRankColor = (rank?: string): string => {
        switch (rank) {
            case 'Tốt': return 'bg-emerald-100 text-emerald-600';
            case 'Khá': return 'bg-blue-100 text-blue-600';
            case 'Trung bình': return 'bg-amber-100 text-amber-600';
            case 'Yếu': return 'bg-red-100 text-red-600';
            default: return 'bg-slate-100 text-slate-400';
        }
    };

    const initiateCertificateExport = (user: RankingUser) => {
        setSelectedUserForCert(user);
        setShowCertEditor(true);
    };

    const handleConfirmExport = async () => {
        if (!selectedUserForCert) return;
        setIsGenerating(true);
        setShowCertEditor(false);

        try {
            const user = selectedUserForCert;
            const fileName = `ChungNhan_${user.user_name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;

            const certData = {
                cert: {
                    id: `RANK-${user.user_id}-${Date.now()}`,
                    user_id: user.user_id,
                    event_id: 'ranking',
                    type: 'excellent',
                    title: certConfig.title,
                    issued_date: certConfig.issuedDate,
                    template_id: 'auto_rank'
                } as any,
                user: {
                    id: user.user_id,
                    full_name: user.user_name,
                    organization: user.class_id
                } as any,
                config: {
                    paperSize: 'A4',
                    fontStyle: certConfig.font,
                    textColor: '#1e293b',
                    logoAlignment: 'center',
                    logoScale: 1,
                    visibility: { qr: false, title: true, recipient: true, eventName: true, date: true, signature: true, logo: true },
                    labels: {
                        title: certConfig.title,
                        presentedTo: certConfig.presentedTo,
                        eventPrefix: certConfig.eventPrefix,
                        datePrefix: certConfig.datePrefix,
                        signature: certConfig.signature
                    },
                    manualEventName: `Top ${user.position} - Bảng Xếp Hạng Thi Đua`,
                    logos: []
                },
                overrideName: user.user_name
            };

            const count = await generateSingleExportPDF([certData], fileName);
            if (count > 0) success(`Đã tạo chứng nhận cho ${user.user_name}`);
            else toastError('Không thể tạo chứng nhận');
        } catch (err) {
            console.error(err);
            toastError('Lỗi tạo chứng nhận');
        } finally {
            setIsGenerating(false);
            setSelectedUserForCert(null);
        }
    };

    const handleBatchExport = async () => {
        setIsGenerating(true);
        try {
            // Filter Top 10 or all if less than 10
            const targets = rankings.slice(0, 10); // Default Top 10 for batch
            const zipName = `ChungNhan_Top10_ThiDua_${new Date().getTime()}.zip`;

            const items = targets.map(user => ({
                cert: {
                    id: `RANK-${user.user_id}-${Date.now()}`,
                    user_id: user.user_id,
                    event_id: 'ranking',
                    type: 'excellent',
                    title: 'Chứng nhận Xuất Sắc',
                    issued_date: new Date().toISOString(),
                    template_id: 'auto_rank'
                } as any,
                user: {
                    id: user.user_id,
                    full_name: user.user_name,
                    organization: user.class_id
                } as any,
                config: {
                    paperSize: 'A4',
                    fontStyle: 'serif',
                    textColor: '#1e293b',
                    logoAlignment: 'center',
                    logoScale: 1,
                    visibility: { qr: false, title: true, recipient: true, eventName: true, date: true, signature: true, logo: true },
                    labels: {
                        title: 'Chứng Nhận',
                        presentedTo: 'Trao tặng cho',
                        eventPrefix: 'Đã đạt thành tích',
                        datePrefix: 'Ngày cấp:',
                        signature: 'Ban Tổ Chức'
                    },
                    manualEventName: `Top ${user.position} - Bảng Xếp Hạng Thi Đua`,
                    logos: []
                },
                overrideName: user.user_name
            }));

            const count = await generateBatchPDF(items, zipName);

            if (count > 0) success(`Đã tải xuống ${count} chứng nhận (ZIP)!`);
            else toastError('Không thể tạo file ZIP.');

        } catch (err) {
            console.error('Batch export failed:', err);
            toastError("Lỗi xuất chứng nhận hàng loạt.");
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
                        </svg>
                        Bảng xếp hạng Nề nếp
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Xếp hạng theo điểm chuyên cần</p>
                </div>

                <div className="flex gap-2 items-center">
                    {/* View Type Toggle */}
                    <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 overflow-hidden">
                        {filterClass ? (
                            <button
                                onClick={handleBackToClasses}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center gap-2 w-full justify-center md:w-auto shadow-sm transition-all"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Quay lại DS Lớp
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => setViewType('student')}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${viewType === 'student' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                    Cá nhân
                                </button>
                                <button
                                    onClick={() => setViewType('class')}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${viewType === 'class' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                                    Theo lớp
                                </button>
                            </>
                        )}
                    </div>

                    <button
                        onClick={handleExport}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Xuất Excel
                    </button>

                    {(currentUserRole === 'admin' || currentUserRole === 'teacher') && (
                        <button
                            onClick={handleBatchExport}
                            disabled={isGenerating}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-lg shadow-indigo-200"
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                            Tải Top 10
                        </button>
                    )}
                </div>
            </div>

            {/* Top 3 Podium */}
            {rankings.length >= 3 && (
                <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-6 text-white relative">
                    <h3 className="text-center font-bold text-white/80 mb-6">TOP 3</h3>
                    <div className="flex justify-center items-end gap-4">
                        {/* 2nd Place */}
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3 mx-auto relative overflow-hidden bg-white/20 backdrop-blur-sm border-2 border-white/30">
                                {rankings[1]?.avatar_url ? (
                                    <img src={rankings[1].avatar_url} className="w-full h-full object-cover" alt="Rank 2" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-slate-300 flex items-center justify-center text-white font-black text-xl">2</div>
                                )}
                            </div>
                            <p className="font-bold text-sm truncate max-w-[100px]">{rankings[1]?.user_name}</p>
                            <p className="text-white/60 text-xs">{rankings[1]?.total_points} điểm</p>
                        </div>

                        {/* 1st Place */}
                        <div className="text-center -mt-4">
                            <div className="w-24 h-24 rounded-2xl flex items-center justify-center mb-3 mx-auto relative overflow-hidden ring-4 ring-yellow-400/50 bg-yellow-400/30 backdrop-blur-sm shadow-xl">
                                {rankings[0]?.avatar_url ? (
                                    <img src={rankings[0].avatar_url} className="w-full h-full object-cover" alt="Rank 1" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-yellow-400 flex items-center justify-center text-white font-black text-2xl">1</div>
                                )}
                            </div>
                            <p className="font-black text-lg truncate max-w-[120px]">{rankings[0]?.user_name}</p>
                            <p className="text-yellow-300 font-bold">{rankings[0]?.total_points} điểm</p>
                        </div>

                        {/* 3rd Place */}
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3 mx-auto relative overflow-hidden bg-white/20 backdrop-blur-sm border-2 border-white/30">
                                {rankings[2]?.avatar_url ? (
                                    <img src={rankings[2].avatar_url} className="w-full h-full object-cover" alt="Rank 3" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-amber-600 flex items-center justify-center text-white font-black text-xl">3</div>
                                )}
                            </div>
                            <p className="font-bold text-sm truncate max-w-[100px]">{rankings[2]?.user_name}</p>
                            <p className="text-white/60 text-xs">{rankings[2]?.total_points} điểm</p>
                        </div>
                    </div>
                    {/* Instant Cert Button for Top 1 */}
                    <div className="absolute top-4 right-4 animate-bounce">
                        <button
                            onClick={() => initiateCertificateExport(rankings[0])}
                            disabled={isGenerating}
                            className="bg-white/20 hover:bg-white/30 backdrop-blur text-white p-2 rounded-full transition-all"
                            title="Tải chứng nhận Top 1"
                        >
                            {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Award className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            )}

            {/* Full Ranking Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 text-left">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Hạng</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{viewType === 'student' || filterClass ? 'Tên học sinh' : 'Lớp'}</th>
                                {(viewType === 'student' || filterClass) && (
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Lớp</th>
                                )}
                                {viewType === 'student' || filterClass ? (
                                    <>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Đúng giờ</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Muộn</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Vắng</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Điểm</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Sĩ số</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">TB Cộng</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Tổng điểm</th>
                                    </>
                                )}
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Xếp loại</th>
                                {(viewType === 'student' || filterClass) && <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center w-10">CN</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rankings.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                        </svg>
                                        <p>Chưa có dữ liệu xếp hạng</p>
                                    </td>
                                </tr>
                            ) : (
                                rankings.map((user, index) => (
                                    <tr
                                        key={index}
                                        className={`transition-colors ${viewType === 'class' && !filterClass ? 'cursor-pointer hover:bg-slate-100' : 'hover:bg-slate-50'}`}
                                        onClick={() => {
                                            if (viewType === 'class' && !filterClass) {
                                                handleClassClick(user.organization || user.user_name);
                                            }
                                        }}
                                    >
                                        <td className="px-6 py-4">
                                            <span className={`text-xl ${user.position <= 3 ? '' : 'text-slate-400 text-sm'}`}>
                                                {getMedalEmoji(user.position)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {viewType === 'student' || filterClass ? (
                                                    <>
                                                        {user.avatar_url ? (
                                                            <img src={user.avatar_url} className="w-10 h-10 rounded-full object-cover border border-indigo-100" alt="" />
                                                        ) : (
                                                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                                                                {user.user_name.charAt(0)}
                                                            </div>
                                                        )}
                                                        <span className="font-bold text-slate-900">{user.user_name}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 font-black">
                                                            {user.user_name}
                                                        </div>
                                                        <span className="font-bold text-slate-900">Lớp {user.user_name}</span>
                                                        <span className="text-xs text-indigo-500 font-medium bg-indigo-50 px-2 py-0.5 rounded ml-2">Click để xem HS</span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        {(viewType === 'student' || filterClass) && (
                                            <td className="px-6 py-4 text-slate-500 font-medium">{user.organization || user.class_id || '—'}</td>
                                        )}
                                        {viewType === 'student' || filterClass ? (
                                            <>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-emerald-600 font-bold">{user.on_time_count || 0}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-amber-600 font-bold">{user.late_count || 0}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="text-red-600 font-bold">{user.absent_count || 0}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-xl font-black text-slate-900">{user.total_points}</span>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-6 py-4 text-center font-bold text-slate-600">{user.student_count} HS</td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-lg font-black text-indigo-600">{user.average_points}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-400">{user.total_points}</td>
                                            </>
                                        )}
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRankColor(user.rank)}`}>
                                                {user.rank || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {(viewType === 'student' || filterClass) && user.position <= 5 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        initiateCertificateExport(user);
                                                    }}
                                                    disabled={isGenerating}
                                                    className="text-amber-500 hover:text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg transition-colors"
                                                    title="Tải chứng nhận"
                                                >
                                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {hasMore && (
                    <div className="p-6 text-center border-t border-slate-50 bg-slate-50/30">
                        <button
                            onClick={() => {
                                const nextNext = page + 1;
                                setPage(nextNext);
                                loadRankings(nextNext);
                            }}
                            disabled={isMoreLoading}
                            className="px-8 py-3 bg-white border border-slate-200 text-indigo-600 font-bold rounded-2xl hover:bg-indigo-50 transition-all shadow-sm flex items-center gap-2 mx-auto disabled:opacity-50"
                        >
                            {isMoreLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            Xem thêm kết quả
                        </button>
                    </div>
                )}
            </div>

            {/* Certificate Editor Modal */}
            {showCertEditor && selectedUserForCert && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                                    <Settings2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800">Tùy chỉnh chứng nhận</h3>
                                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Học sinh: {selectedUserForCert.user_name}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowCertEditor(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Tiêu đề bằng</label>
                                    <input
                                        type="text"
                                        value={certConfig.title}
                                        onChange={e => setCertConfig({ ...certConfig, title: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Ngày cấp</label>
                                    <input
                                        type="text"
                                        value={certConfig.issuedDate}
                                        onChange={e => setCertConfig({ ...certConfig, issuedDate: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">Nội dung vinh danh</label>
                                <textarea
                                    value={certConfig.eventPrefix}
                                    onChange={e => setCertConfig({ ...certConfig, eventPrefix: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 h-20 resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Người ký</label>
                                    <input
                                        type="text"
                                        value={certConfig.signature}
                                        onChange={e => setCertConfig({ ...certConfig, signature: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Font chữ (Khắc phục lỗi font)</label>
                                    <select
                                        value={certConfig.font}
                                        onChange={e => setCertConfig({ ...certConfig, font: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                                    >
                                        <option value="serif">Playfair Display (Sang trọng)</option>
                                        <option value="sans">Arimo / Sans (Rõ nét)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={() => setShowCertEditor(false)}
                                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handleConfirmExport}
                                className="flex-[2] px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                Xác nhận và Tải PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RankingBoard;

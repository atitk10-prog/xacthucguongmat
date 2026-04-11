import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { utils, writeFile } from 'xlsx';
import { Download, Loader2, X, ArrowLeft, Users, Home, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [viewType, setViewType] = useState<'student' | 'class'>(type);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [currentUserRole, setCurrentUserRole] = useState<string>('student');
    const [filterClass, setFilterClass] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<'week' | 'month' | 'semester' | 'all'>('all');
    const [isExportingAll, setIsExportingAll] = useState(false);
    const { success, error: toastError } = useToast();

    // Advanced Export Modal State
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportDateRange, setExportDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('week');
    const [exportStartDate, setExportStartDate] = useState('');
    const [exportEndDate, setExportEndDate] = useState('');
    const [exportType, setExportType] = useState<'all' | 'positive' | 'negative'>('all');
    const [exportTarget, setExportTarget] = useState<'all' | 'class' | 'student'>('all');
    const [exportTargetClass, setExportTargetClass] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    // Debounce ref for realtime
    const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const user = dataService.getStoredUser();
        if (user) setCurrentUserRole(user.role);
    }, []);

    useEffect(() => {
        setPage(0);
        setRankings([]);
        loadRankings(0, true);

        // Realtime Subscription with debounce
        const channel = supabase
            .channel('ranking_updates')
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'point_logs' }, () => {
                debouncedReload();
            })
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'boarding_attendance' }, () => {
                debouncedReload();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        };
    }, [viewType, classId, roomId, filterClass, dateRange]);

    const debouncedReload = () => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => {
            loadRankings(0, true);
        }, 30000); // 30s debounce
    };

    const PAGE_SIZE = 20;

    const loadRankings = async (pageNum: number, isInitial: boolean = false) => {
        if (isInitial) setIsLoading(true);
        else setIsPageLoading(true);

        try {
            const typeToFetch = filterClass ? 'student' : viewType;

            const result = await dataService.getRanking({
                type: typeToFetch,
                role: 'student',
                limit: PAGE_SIZE,
                page: pageNum,
                organization: filterClass || undefined,
                dateRange: dateRange
            });

            if (result.success && result.data) {
                const rawData = result.data as any[];
                setHasMore(rawData.length === PAGE_SIZE);

                const mappedData = rawData.map((item) => {
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

                setRankings(mappedData);
            }
        } catch (error) {
            console.error('Failed to load rankings:', error);
        } finally {
            setIsLoading(false);
            setIsPageLoading(false);
        }
    };

    const handleClassClick = (className: string) => {
        setFilterClass(className);
    };

    const handleBackToClasses = () => {
        setFilterClass(null);
    };

    const handleExport = async () => {
        setIsExportingAll(true);
        try {
            // Fetch ALL rankings (no pagination) for export
            const typeToFetch = filterClass ? 'student' : viewType;
            const allResult = await dataService.getRanking({
                type: typeToFetch,
                role: 'student',
                limit: 9999,
                page: 0,
                organization: filterClass || undefined,
                dateRange: dateRange
            });

            const allData = allResult.success && allResult.data ? allResult.data as any[] : rankings;
            const exportData: RankingUser[] = allData.map((item, index) => {
                let classification = 'Chưa xếp loại';
                const pointsToUse = typeToFetch === 'student' ? item.total_points : item.average_points;
                if (pointsToUse >= 90) classification = 'Tốt';
                else if (pointsToUse >= 70) classification = 'Khá';
                else if (pointsToUse >= 50) classification = 'Trung bình';
                else if (pointsToUse > 0) classification = 'Yếu';

                return {
                    position: item.rank || index + 1,
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

            // Build rows helper
            const buildRows = (items: RankingUser[]) => {
                const sorted = [...items].sort((a, b) => {
                    const orgA = a.organization || a.class_id || '';
                    const orgB = b.organization || b.class_id || '';
                    if (orgA !== orgB) return orgA.localeCompare(orgB, 'vi');
                    return (a.user_name || '').localeCompare(b.user_name || '', 'vi');
                });

                return sorted.map((r, i) => ({
                    'STT': i + 1,
                    'Hạng': r.position,
                    'Họ và tên': r.user_name,
                    'Lớp': r.organization || r.class_id || 'N/A',
                    'Đúng giờ': r.on_time_count || 0,
                    'Muộn': r.late_count || 0,
                    'Vắng': r.absent_count || 0,
                    'Tổng điểm': r.total_points,
                    'Xếp loại': r.rank || 'N/A'
                }));
            };

            const wb = utils.book_new();
            const colWidths = [{ wch: 5 }, { wch: 6 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];

            // Sheet 1: Tổng hợp
            const allRows = buildRows(exportData);
            const wsAll = utils.json_to_sheet(allRows);
            wsAll['!cols'] = colWidths;
            utils.book_append_sheet(wb, wsAll, 'Tổng hợp');

            // Tabs per class
            const orgGroups = new Map<string, RankingUser[]>();
            exportData.forEach(r => {
                const org = r.organization || r.class_id || 'Khác';
                if (!orgGroups.has(org)) orgGroups.set(org, []);
                orgGroups.get(org)!.push(r);
            });

            const sortedOrgs = [...orgGroups.keys()].sort((a, b) => a.localeCompare(b, 'vi'));
            for (const org of sortedOrgs) {
                const students = orgGroups.get(org)!;
                const rows = buildRows(students);
                const ws = utils.json_to_sheet(rows);
                ws['!cols'] = colWidths;
                const sheetName = org.length > 31 ? org.substring(0, 31) : org;
                utils.book_append_sheet(wb, ws, sheetName);
            }

            const today = new Date().toISOString().split('T')[0];
            writeFile(wb, `BangXepHang_${today}.xlsx`);
            success(`Đã xuất ${exportData.length} bản ghi!`);
        } catch (err) {
            console.error('Export failed:', err);
            toastError('Lỗi xuất Excel');
        } finally {
            setIsExportingAll(false);
        }
    };

    // Advanced Export with filters
    const handleExportDetailed = async () => {
        setIsExporting(true);
        try {
            // Calculate date range
            let startDate: Date;
            let endDate: Date = new Date();

            if (exportDateRange === 'today') {
                startDate = new Date();
                startDate.setHours(0, 0, 0, 0);
            } else if (exportDateRange === 'week') {
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
            } else if (exportDateRange === 'month') {
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
            } else {
                startDate = exportStartDate ? new Date(exportStartDate) : new Date();
                endDate = exportEndDate ? new Date(exportEndDate) : new Date();
            }

            // Fetch point logs
            let query = supabase
                .from('point_logs')
                .select('id, user_id, points, reason, type, created_at, created_by, event_id')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString())
                .order('created_at', { ascending: false });

            // Filter by point type
            if (exportType === 'positive') {
                query = query.gt('points', 0);
            } else if (exportType === 'negative') {
                query = query.lt('points', 0);
            }

            const { data: logs, error } = await query;
            if (error) throw error;

            // Fetch user, event info for mapping
            const userIds = [...new Set((logs || []).map(l => l.user_id))];
            const creatorIds = [...new Set((logs || []).filter(l => l.created_by).map(l => l.created_by))];
            const allUserIds = [...new Set([...userIds, ...creatorIds])];
            const eventIds = [...new Set((logs || []).filter(l => l.event_id).map(l => l.event_id))];

            const [{ data: users }, { data: events }] = await Promise.all([
                supabase.from('users').select('id, full_name, organization').in('id', allUserIds),
                supabase.from('events').select('id, name').in('id', eventIds)
            ]);

            const userMap: Record<string, { name: string; org: string }> = {};
            users?.forEach(u => {
                userMap[u.id] = { name: u.full_name, org: u.organization || '' };
            });

            const eventMap: Record<string, string> = {};
            events?.forEach(e => {
                eventMap[e.id] = e.name;
            });

            // Filter by class if needed
            let filteredLogs = logs || [];
            if (exportTarget === 'class' && exportTargetClass) {
                filteredLogs = filteredLogs.filter(l => userMap[l.user_id]?.org === exportTargetClass);
            }

            // --- DATA PREPARATION FOR 5 SHEETS ---
            const buildStandardRow = (log: any) => ({
                'Ngày giờ': new Date(log.created_at).toLocaleString('vi-VN'),
                'Họ và tên': userMap[log.user_id]?.name || 'N/A',
                'Lớp': userMap[log.user_id]?.org || 'N/A',
                'Nội dung': log.reason || '',
                'Số điểm': log.points,
                'Loại': log.points > 0 ? 'Thành tích' : 'Vi phạm',
                'Sự kiện': eventMap[log.event_id || ''] || 'N/A',
                'Người thực hiện': (log.created_by && userMap[log.created_by]) ? userMap[log.created_by].name : 'Hệ thống (Tự động)'
            });

            const dataAll = filteredLogs.map(buildStandardRow);
            const dataPositive = filteredLogs.filter(l => l.points > 0).map(buildStandardRow);
            const dataNegative = filteredLogs.filter(l => l.points < 0).map(buildStandardRow);

            const classStats: Record<string, any> = {};
            filteredLogs.forEach(l => {
                const org = userMap[l.user_id]?.org || 'Chưa phân lớp';
                if (!classStats[org]) classStats[org] = { 'Lớp': org, 'Tổng điểm cộng': 0, 'Tổng điểm trừ': 0, 'Hiệu số': 0, 'Số lượt': 0 };
                if (l.points > 0) classStats[org]['Tổng điểm cộng'] += l.points;
                else classStats[org]['Tổng điểm trừ'] += Math.abs(l.points);
                classStats[org]['Hiệu số'] += l.points;
                classStats[org]['Số lượt']++;
            });
            const dataByClass = Object.values(classStats).sort((a, b) => b['Hiệu số'] - a['Hiệu số']);

            const eventStats: Record<string, any> = {};
            filteredLogs.forEach(l => {
                const eventName = eventMap[l.event_id || ''] || (l.type.includes('boarding_') ? 'Nội trú' : 'Ghi nhận thủ công');
                if (!eventStats[eventName]) eventStats[eventName] = { 'Tên Sự kiện/Hoạt động': eventName, 'Tổng điểm phát ra': 0, 'Số lượt tham gia': 0 };
                eventStats[eventName]['Tổng điểm phát ra'] += Math.abs(l.points);
                eventStats[eventName]['Số lượt tham gia']++;
            });
            const dataByEvent = Object.values(eventStats).sort((a, b) => b['Tổng điểm phát ra'] - a['Tổng điểm phát ra']);

            const wb = utils.book_new();

            const sheets = [
                { name: 'TongHop', data: dataAll },
                { name: 'KhenThuong', data: dataPositive },
                { name: 'ViPham', data: dataNegative },
                { name: 'BaoCao_TheoLop', data: dataByClass },
                { name: 'BaoCao_TheoSuKien', data: dataByEvent }
            ];

            sheets.forEach(s => {
                const ws = utils.json_to_sheet(s.data);
                if (s.data.length > 0 && s.data[0]['Họ và tên']) {
                    ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 20 }];
                }
                utils.book_append_sheet(wb, ws, s.name);
            });

            const rangeName = exportDateRange === 'today' ? 'HomNay' : exportDateRange === 'week' ? '7Ngay' : exportDateRange === 'month' ? '30Ngay' : 'TuyChon';
            writeFile(wb, `BaoCaoRanking_${rangeName}_${new Date().getTime()}.xlsx`);

            success(`Đã xuất báo cáo đa sheet với ${dataAll.length} bản ghi!`);
            setShowExportModal(false);
        } catch (err) {
            console.error('Export failed:', err);
            toastError('Lỗi xuất báo cáo chi tiết');
        } finally {
            setIsExporting(false);
        }
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

    const dateRangeLabels: Record<string, string> = {
        week: 'Tuần',
        month: 'Tháng',
        semester: 'Học kỳ',
        all: 'Tất cả'
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="w-full md:w-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2 md:gap-3">
                        <svg className="w-6 h-6 md:w-8 md:h-8 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
                        </svg>
                        <span className="truncate">BXH Nề nếp</span>
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 text-xs md:text-sm">Xếp hạng theo điểm chuyên cần</p>
                </div>

                <div className="flex w-full md:w-auto gap-2 items-center flex-wrap">
                    {/* View Type Toggle */}
                    <div className="flex bg-white rounded-xl md:rounded-2xl p-1 shadow-sm border border-slate-100 w-fit">
                        {filterClass ? (
                            <button
                                onClick={handleBackToClasses}
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg md:rounded-xl font-bold hover:bg-indigo-700 flex items-center gap-2 w-full justify-center md:w-auto shadow-sm transition-all text-[10px] md:text-sm"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span className="truncate">Quay lại DS Cá nhân</span>
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => setViewType('student')}
                                    className={`px-3 py-1.5 rounded-lg md:rounded-xl text-[10px] md:text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${viewType === 'student' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <Users className="w-3.5 h-3.5 text-current" />
                                    Cá nhân
                                </button>
                                <button
                                    onClick={() => setViewType('class')}
                                    className={`px-3 py-1.5 rounded-lg md:rounded-xl text-[10px] md:text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${viewType === 'class' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <Home className="w-3.5 h-3.5 text-current" />
                                    Lớp
                                </button>
                            </>
                        )}
                    </div>

                    {/* Date Range Filter */}
                    <div className="flex bg-white rounded-xl md:rounded-2xl p-1 shadow-sm border border-slate-100 w-fit">
                        {(['week', 'month', 'semester', 'all'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-2 md:px-3 py-1.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all whitespace-nowrap ${dateRange === range ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                {dateRangeLabels[range]}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={isExportingAll}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center gap-1.5 shadow-lg shadow-emerald-200 text-xs md:text-sm flex-1 md:flex-none justify-center disabled:opacity-50"
                    >
                        {isExportingAll ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Download className="w-4 h-4 md:w-5 md:h-5" />}
                        <span className="hidden sm:inline">Xuất Excel</span>
                        <span className="sm:hidden">Excel</span>
                    </button>

                    {(currentUserRole === 'admin' || currentUserRole === 'teacher') && (
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="px-3 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 flex items-center gap-1.5 shadow-lg shadow-purple-200 text-xs md:text-sm flex-1 md:flex-none justify-center"
                        >
                            <Filter className="w-4 h-4 md:w-5 md:h-5" />
                            <span className="truncate">Báo cáo chi tiết</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Top 3 Podium */}
            {rankings.length >= 3 && (
                <div className="bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-700 rounded-3xl p-6 md:p-10 text-white relative overflow-hidden shadow-xl shadow-indigo-100">
                    {/* Background Glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-white/10 blur-[100px] rounded-full"></div>

                    <div className="relative z-20 mb-8 md:mb-12">
                        <h3 className="text-center font-black text-white uppercase tracking-[0.2em] text-sm md:text-base drop-shadow-lg">
                            Bảng Vàng Danh Dự
                        </h3>
                        <div className="w-24 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto mt-2"></div>
                    </div>

                    <div className="flex justify-center items-end gap-3 md:gap-12 max-w-2xl mx-auto relative z-10">
                        {/* 2nd Place */}
                        <div className="text-center flex-1 min-w-0">
                            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mb-2 md:mb-3 mx-auto relative overflow-hidden bg-white/20 backdrop-blur-sm border-2 border-white/30">
                                {rankings[1]?.avatar_url ? (
                                    <img src={rankings[1].avatar_url} className="w-full h-full object-cover" alt="Rank 2" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-black text-xl bg-slate-400">2</div>
                                )}
                            </div>
                            <p className="font-bold text-[10px] md:text-sm truncate w-full">{rankings[1]?.user_name}</p>
                            <p className="text-white/60 text-[8px] md:text-xs">{rankings[1]?.total_points} đ</p>
                        </div>

                        {/* 1st Place */}
                        <div className="text-center flex-1 min-w-0 -mt-4 md:-mt-8 scale-110 md:scale-125">
                            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center mb-2 md:mb-3 mx-auto relative overflow-hidden ring-4 ring-yellow-400/50 bg-yellow-400/30 backdrop-blur-sm shadow-xl z-10">
                                {rankings[0]?.avatar_url ? (
                                    <img src={rankings[0].avatar_url} className="w-full h-full object-cover" alt="Rank 1" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-black text-2xl bg-yellow-400">1</div>
                                )}
                            </div>
                            <p className="font-black text-xs md:text-lg truncate w-full">{rankings[0]?.user_name}</p>
                            <p className="text-yellow-300 font-bold text-[10px] md:text-base">{rankings[0]?.total_points} đ</p>
                        </div>

                        {/* 3rd Place */}
                        <div className="text-center flex-1 min-w-0">
                            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mb-2 md:mb-3 mx-auto relative overflow-hidden bg-white/20 backdrop-blur-sm border-2 border-white/30">
                                {rankings[2]?.avatar_url ? (
                                    <img src={rankings[2].avatar_url} className="w-full h-full object-cover" alt="Rank 3" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-black text-xl bg-amber-600">3</div>
                                )}
                            </div>
                            <p className="font-bold text-[10px] md:text-sm truncate w-full">{rankings[2]?.user_name}</p>
                            <p className="text-white/60 text-[8px] md:text-xs">{rankings[2]?.total_points} đ</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Full Ranking Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50 text-left">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Hạng</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">{viewType === 'student' || filterClass ? 'Tên học sinh' : 'Lớp'}</th>
                                {(viewType === 'student' || filterClass) && (
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Lớp</th>
                                )}
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Đúng giờ</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Muộn</th>
                                {(viewType === 'student' || filterClass) && (
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Vắng</th>
                                )}
                                {viewType === 'class' && !filterClass && (
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Sĩ số</th>
                                )}
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">
                                    {viewType === 'class' && !filterClass ? 'TB Cộng' : 'Điểm'}
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Xếp loại</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rankings.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
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
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-emerald-600 font-bold">{user.on_time_count || 0}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-amber-600 font-bold">{user.late_count || 0}</span>
                                        </td>
                                        {(viewType === 'student' || filterClass) && (
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-red-600 font-bold">{user.absent_count || 0}</span>
                                            </td>
                                        )}
                                        {viewType === 'class' && !filterClass && (
                                            <td className="px-6 py-4 text-center font-bold text-slate-600">{user.student_count} HS</td>
                                        )}
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xl font-black text-slate-900">
                                                {viewType === 'class' && !filterClass ? user.average_points : user.total_points}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRankColor(user.rank)}`}>
                                                {user.rank || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 md:p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <p className="text-xs md:text-sm text-slate-500 font-medium">
                        Trang <span className="font-black text-slate-700">{page + 1}</span>
                        {' • '}
                        Hiển thị <span className="font-black text-slate-700">{rankings.length}</span> kết quả
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => {
                                const prev = Math.max(0, page - 1);
                                setPage(prev);
                                loadRankings(prev);
                            }}
                            disabled={page === 0 || isPageLoading}
                            className="p-2 md:px-3 md:py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            <span className="hidden md:inline text-sm font-bold">Trước</span>
                        </button>
                        
                        {/* Page number buttons */}
                        {Array.from({ length: Math.min(5, page + (hasMore ? 2 : 1)) }, (_, i) => {
                            const startPage = Math.max(0, page - 2);
                            const pageNum = startPage + i;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => {
                                        setPage(pageNum);
                                        loadRankings(pageNum);
                                    }}
                                    disabled={isPageLoading}
                                    className={`w-9 h-9 md:w-10 md:h-10 rounded-xl text-sm font-bold transition-all ${page === pageNum
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                                    } disabled:opacity-50`}
                                >
                                    {pageNum + 1}
                                </button>
                            );
                        })}

                        <button
                            onClick={() => {
                                const next = page + 1;
                                setPage(next);
                                loadRankings(next);
                            }}
                            disabled={!hasMore || isPageLoading}
                            className="p-2 md:px-3 md:py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <span className="hidden md:inline text-sm font-bold">Tiếp</span>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    {isPageLoading && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
                </div>
            </div>

            {/* Advanced Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-purple-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white">
                                    <Download className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800">Xuất Báo Cáo Chi Tiết</h3>
                                    <p className="text-xs text-slate-500 font-medium">Tùy chọn lọc theo ngày, tuần, tháng</p>
                                </div>
                            </div>
                            <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Date Range */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">Khoảng thời gian</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(['today', 'week', 'month', 'custom'] as const).map(range => (
                                        <button
                                            key={range}
                                            onClick={() => setExportDateRange(range)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${exportDateRange === range ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {range === 'today' ? 'Hôm nay' : range === 'week' ? 'Tuần' : range === 'month' ? 'Tháng' : 'Tùy chọn'}
                                        </button>
                                    ))}
                                </div>
                                {exportDateRange === 'custom' && (
                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <input
                                            type="date"
                                            value={exportStartDate}
                                            onChange={e => setExportStartDate(e.target.value)}
                                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                                        />
                                        <input
                                            type="date"
                                            value={exportEndDate}
                                            onChange={e => setExportEndDate(e.target.value)}
                                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Report Type */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">Loại dữ liệu</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['all', 'positive', 'negative'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setExportType(type)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${exportType === type ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {type === 'all' ? 'Tất cả' : type === 'positive' ? 'Thành tích (+)' : 'Vi phạm (-)'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Target */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">Phạm vi</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['all', 'class'] as const).map(target => (
                                        <button
                                            key={target}
                                            onClick={() => setExportTarget(target)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${exportTarget === target ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {target === 'all' ? 'Toàn trường' : 'Theo lớp'}
                                        </button>
                                    ))}
                                </div>
                                {exportTarget === 'class' && (
                                    <input
                                        type="text"
                                        placeholder="Nhập tên lớp (VD: 10A1)"
                                        value={exportTargetClass}
                                        onChange={e => setExportTargetClass(e.target.value)}
                                        className="w-full mt-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleExportDetailed}
                                disabled={isExporting}
                                className="flex-[2] px-6 py-3 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-700 transition-all shadow-lg shadow-purple-100 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                Xuất Excel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RankingBoard;

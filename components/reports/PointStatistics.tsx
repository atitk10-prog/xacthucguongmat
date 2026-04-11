import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { utils, writeFile } from 'xlsx';
import {
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, BarChart, Bar
} from 'recharts';
import { TrendingUp, TrendingDown, Award, AlertCircle, Calendar, Filter, Users, ArrowRight, Download, Loader2, X, Settings2, ChevronLeft, ChevronRight, BarChart3, Medal, ShieldAlert, ShieldCheck, PartyPopper, Search } from 'lucide-react';
import { useToast } from '../ui/Toast';

const PointStatistics: React.FC = () => {
    const [range, setRange] = useState<'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('day');
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showDetail, setShowDetail] = useState(false);
    const [detailedLogs, setDetailedLogs] = useState<any[]>([]);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [detailPage, setDetailPage] = useState(0);
    const [detailSearch, setDetailSearch] = useState('');
    const [detailFilter, setDetailFilter] = useState<'all' | 'boarding' | 'event' | 'manual'>('all');
    const DETAIL_PAGE_SIZE = 20;
    const { success, error: toastError } = useToast();

    // Helper: compute % change
    const pctChange = (current: number, prev: number): { text: string; positive: boolean } | null => {
        if (prev === 0 && current === 0) return null;
        if (prev === 0) return { text: 'Mới', positive: current > 0 };
        const pct = Math.round(((current - prev) / prev) * 100);
        if (pct === 0) return { text: '0%', positive: true };
        return { text: `${pct > 0 ? '↑' : '↓'}${Math.abs(pct)}%`, positive: pct < 0 ? (current < prev) : (current > prev) };
    };

    // Advanced Export Modal State
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportDateRange, setExportDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('week');
    const [exportStartDate, setExportStartDate] = useState('');
    const [exportEndDate, setExportEndDate] = useState('');
    const [exportType, setExportType] = useState<'all' | 'positive' | 'negative'>('all');
    const [exportTarget, setExportTarget] = useState<'all' | 'class'>('all');
    const [exportTargetClass, setExportTargetClass] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        loadStats();
    }, [range, customDateFrom, customDateTo]);

    const loadStats = async () => {
        setIsLoading(true);
        try {
            const opts: any = { range };
            if (range === 'custom' && customDateFrom && customDateTo) {
                opts.startDate = customDateFrom;
                opts.endDate = customDateTo;
            } else if (range === 'custom') {
                setIsLoading(false);
                return;
            }
            const result = await dataService.getPointStatistics(opts);
            if (result.success) {
                setStats(result.data);
            }
        } catch (error) {
            console.error('Failed to load point stats:', error);
        } finally {
            setIsLoading(false);
        }
    };



    const loadDetailedLogs = async () => {
        setShowDetail(true);
        setDetailPage(0);
        setDetailSearch('');
        setDetailFilter('all');
        setIsDetailLoading(true);
        const res = await dataService.getDetailedPointLogs({ range, limit: 500 });
        if (res.success) setDetailedLogs(res.data || []);
        setIsDetailLoading(false);
    };

    // Filtered + paginated detail logs
    const filteredDetailLogs = useMemo(() => {
        let logs = detailedLogs;
        // Filter by category
        if (detailFilter !== 'all') {
            logs = logs.filter(l => {
                const t = l.type || '';
                if (detailFilter === 'boarding') return t.startsWith('boarding_');
                if (detailFilter === 'event') return t.startsWith('event') || t === 'checkin';
                if (detailFilter === 'manual') return t.startsWith('manual') || (!t.startsWith('boarding_') && !t.startsWith('event'));
                return true;
            });
        }
        // Search by name
        if (detailSearch.trim()) {
            const q = detailSearch.toLowerCase().trim();
            logs = logs.filter(l =>
                (l.user?.full_name || '').toLowerCase().includes(q) ||
                (l.reason || '').toLowerCase().includes(q) ||
                (l.user?.organization || '').toLowerCase().includes(q)
            );
        }
        return logs;
    }, [detailedLogs, detailFilter, detailSearch]);

    const paginatedDetailLogs = useMemo(() => {
        const start = detailPage * DETAIL_PAGE_SIZE;
        return filteredDetailLogs.slice(start, start + DETAIL_PAGE_SIZE);
    }, [filteredDetailLogs, detailPage]);
    const totalDetailPages = Math.ceil(filteredDetailLogs.length / DETAIL_PAGE_SIZE);

    // Advanced Export with filters
    const handleExportDetailed = async () => {
        setIsExporting(true);
        try {
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

            let query = supabase
                .from('point_logs')
                .select('id, user_id, points, reason, type, created_at, created_by, event_id')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString())
                .order('created_at', { ascending: false });

            if (exportType === 'positive') {
                query = query.gt('points', 0);
            } else if (exportType === 'negative') {
                query = query.lt('points', 0);
            }

            const { data: logs, error } = await query;
            if (error) throw error;

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

            let filteredLogs = logs || [];
            if (exportTarget === 'class' && exportTargetClass) {
                filteredLogs = filteredLogs.filter(l => userMap[l.user_id]?.org === exportTargetClass);
            }

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
            writeFile(wb, `BaoCaoDiem_${rangeName}_${new Date().getTime()}.xlsx`);

            success(`Đã xuất báo cáo đa sheet với ${dataAll.length} bản ghi!`);
            setShowExportModal(false);
        } catch (err) {
            console.error('Export failed:', err);
            toastError('Lỗi xuất báo cáo chi tiết');
        } finally {
            setIsExporting(false);
        }
    };

    const getTypeLabel = (type: string) => {
        const labels: any = {
            boarding_late: { text: 'Trễ nội trú', icon: <Calendar className="w-3 h-3" />, color: 'text-orange-600 bg-orange-50' },
            boarding_absent: { text: 'Vắng nội trú', icon: <AlertCircle className="w-3 h-3" />, color: 'text-red-600 bg-red-50' },
            boarding_on_time: { text: 'Đúng giờ NTrú', icon: <Award className="w-3 h-3" />, color: 'text-emerald-600 bg-emerald-50' },
            event_absence: { text: 'Vắng sự kiện', icon: <Filter className="w-3 h-3" />, color: 'text-amber-600 bg-amber-50' },
            event: { text: 'Sự kiện', icon: <Users className="w-3 h-3" />, color: 'text-blue-600 bg-blue-50' },
            manual_add: { text: 'Cộng thủ công', icon: <Award className="w-3 h-3" />, color: 'text-emerald-600 bg-emerald-50' },
            manual_deduct: { text: 'Trừ thủ công', icon: <TrendingDown className="w-3 h-3" />, color: 'text-rose-600 bg-rose-50' },
            checkin: { text: 'Tham gia', icon: <Users className="w-3 h-3" />, color: 'text-blue-600 bg-blue-50' }
        };
        return labels[type] || { text: type, icon: <Award className="w-3 h-3" />, color: 'text-slate-600 bg-slate-50' };
    };

    const pieData = useMemo(() => {
        if (!stats || !stats.byCategory) return [];
        return [
            { name: 'Nội trú', value: Math.abs(stats.byCategory.boarding || 0), color: '#6366f1' },
            { name: 'Sự kiện', value: Math.abs(stats.byCategory.event || 0), color: '#10b981' },
            { name: 'Thủ công', value: Math.abs(stats.byCategory.manual || 0), color: '#f59e0b' },
        ].filter(d => d.value > 0);
    }, [stats]);

    // AI Insights - enhanced
    const aiInsight = useMemo(() => {
        if (!stats) return '';
        const { totalAdded, totalDeducted, byCategory, logsCount, topAdded, topDeducted } = stats;

        const parts: string[] = [];

        // Overall trend
        if (totalDeducted > totalAdded) {
            parts.push(`Điểm trừ (${totalDeducted}) vượt điểm cộng (${totalAdded}). Cần kiểm tra các vi phạm.`);
        } else if (totalAdded > 0) {
            const ratio = totalDeducted > 0 ? (totalAdded / totalDeducted).toFixed(1) : '∞';
            parts.push(`Hệ thống tích cực: Tỷ lệ cộng/trừ = ${ratio}x.`);
        }

        // Dominant category
        const cats = Object.entries(byCategory || {}) as [string, number][];
        const dominant = cats.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
        if (dominant) {
            const labels: Record<string, string> = { boarding: 'Nội trú', event: 'Sự kiện', manual: 'Thủ công' };
            parts.push(`Nguồn biến động lớn nhất: ${labels[dominant[0]] || dominant[0]} (${dominant[1] > 0 ? '+' : ''}${dominant[1]} điểm).`);
        }

        // Top violator highlight
        if (topDeducted?.length > 0) {
            parts.push(`HS bị trừ nhiều nhất: ${topDeducted[0].name} (-${topDeducted[0].points}đ).`);
        }

        // Volume
        parts.push(`Tổng ${logsCount} lượt ghi nhận trong giai đoạn.`);

        return parts.join(' ');
    }, [stats]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <span className="bg-amber-100 p-2 rounded-xl text-amber-600"><BarChart3 className="w-6 h-6" /></span>
                        Thống kê Điểm số
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 ml-14">Phân tích biến động và hành vi</p>
                </div>

                <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
                    <div className="flex bg-slate-100 p-1 rounded-xl flex-1 md:flex-none flex-wrap">
                        {([
                            { key: 'day', label: 'Hôm nay' },
                            { key: 'week', label: '7 ngày' },
                            { key: 'month', label: '30 ngày' },
                            { key: 'quarter', label: '3 tháng' },
                            { key: 'year', label: '1 năm' },
                            { key: 'custom', label: 'Tùy chọn' },
                        ] as const).map((r) => (
                            <button
                                key={r.key}
                                onClick={() => setRange(r.key)}
                                className={`flex-1 md:flex-none px-3 py-2 rounded-lg font-bold text-sm transition-all ${range === r.key
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    {range === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-200" />
                            <span className="text-slate-400 text-xs">→</span>
                            <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-200" />
                        </div>
                    )}
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 flex items-center gap-2 shadow-lg shadow-purple-200 text-sm"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden md:inline">Xuất Excel</span>
                    </button>
                </div>
            </div>
            {/* AI Insights Bar */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-5 rounded-2xl text-white flex flex-col md:flex-row gap-4 items-start md:items-center shadow-lg">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                </div>
                <p className="flex-1 text-slate-300 text-sm leading-relaxed">
                    {aiInsight || 'Chưa có đủ dữ liệu để phân tích.'}
                </p>
                <button
                    onClick={loadDetailedLogs}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm transition-all flex items-center gap-2 flex-shrink-0"
                >
                    Chi tiết
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>


            {/* Overview Cards */}
            {(() => {
                const addedChange = stats ? pctChange(stats.totalAdded, stats.prevAdded) : null;
                const deductedChange = stats ? pctChange(stats.totalDeducted, stats.prevDeducted) : null;
                const txnChange = stats ? pctChange(stats.logsCount, stats.prevLogsCount) : null;
                const rangeLabel = range === 'day' ? 'hôm qua' : range === 'week' ? '7 ngày trước' : 'tháng trước';

                return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                <TrendingUp className="w-16 h-16 text-emerald-500" />
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Tổng điểm cộng</p>
                                {addedChange && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${addedChange.positive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                        {addedChange.text}
                                    </span>
                                )}
                            </div>
                            <p className="text-4xl font-black text-emerald-600">+{stats?.totalAdded || 0}</p>
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                                <Award className="w-4 h-4" />
                                so với {rangeLabel}: {stats?.prevAdded || 0}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                <TrendingDown className="w-16 h-16 text-red-500" />
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Tổng điểm trừ</p>
                                {deductedChange && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${!deductedChange.positive ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {deductedChange.text}
                                    </span>
                                )}
                            </div>
                            <p className="text-4xl font-black text-red-500">-{stats?.totalDeducted || 0}</p>
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                                <AlertCircle className="w-4 h-4" />
                                so với {rangeLabel}: {stats?.prevDeducted || 0}
                            </div>
                        </div>

                        <div className="bg-indigo-600 p-6 rounded-3xl shadow-lg shadow-indigo-200 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-20 text-white group-hover:scale-110 transition-transform">
                                <Users className="w-16 h-16" />
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-indigo-100 font-bold text-xs uppercase tracking-wider">Cân bằng hệ thống</p>
                                {txnChange && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white">
                                        {txnChange.text} lượt
                                    </span>
                                )}
                            </div>
                            <p className="text-4xl font-black text-white">
                                {(stats?.totalAdded || 0) - (stats?.totalDeducted || 0) > 0 ? '+' : ''}
                                {(stats?.totalAdded || 0) - (stats?.totalDeducted || 0)}
                            </p>
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-indigo-200">
                                {stats?.logsCount || 0} lượt ghi nhận (trước: {stats?.prevLogsCount || 0})
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribution Pie Chart */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <Filter className="w-5 h-5 text-indigo-500" />
                        Cơ cấu điểm theo hạng mục
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Bar Chart */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <Award className="w-5 h-5 text-emerald-500" />
                        Chi tiết từng nhóm (Điểm thuần)
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={[
                                    { name: 'Nội trú', 'Điểm': stats?.byCategory?.boarding || 0 },
                                    { name: 'Sự kiện', 'Điểm': stats?.byCategory?.event || 0 },
                                    { name: 'Thủ công', 'Điểm': stats?.byCategory?.manual || 0 }
                                ]}
                                margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="Điểm" radius={[8, 8, 0, 0]}>
                                    {
                                        [
                                            { name: 'Nội trú', d: stats?.byCategory?.boarding || 0 },
                                            { name: 'Sự kiện', d: stats?.byCategory?.event || 0 },
                                            { name: 'Thủ công', d: stats?.byCategory?.manual || 0 }
                                        ].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.d >= 0 ? '#10b981' : '#ef4444'} />
                                        ))
                                    }
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* NEW: Daily Trend Chart */}
            {stats?.dailyTrend && stats.dailyTrend.length > 1 && (
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        Xu hướng theo ngày
                        <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-bold">{stats.dailyTrend.length} ngày</span>
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.dailyTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorAdded" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorDeducted" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="added" name="Điểm cộng" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAdded)" />
                                <Area type="monotone" dataKey="deducted" name="Điểm trừ" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorDeducted)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Top 5 Tables — Always show both for symmetry */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top 5 Thành tích */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-sm">Top 5 Thành tích</h3>
                            <p className="text-xs text-slate-400">Học sinh được cộng nhiều nhất</p>
                        </div>
                    </div>
                    {stats?.topAdded?.length > 0 ? (
                        <div className="divide-y divide-slate-50">
                            {stats.topAdded.map((u: any, i: number) => (
                                <div key={u.userId} className="flex items-center gap-4 px-5 py-3 hover:bg-emerald-50/50 transition-colors">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm truncate">{u.name}</p>
                                        <p className="text-[11px] text-slate-400">{u.org}</p>
                                    </div>
                                    <span className="font-black text-emerald-600 text-lg">+{u.points}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                                <Award className="w-7 h-7 text-emerald-200" />
                            </div>
                            <p className="text-sm font-bold text-slate-300">Chưa có dữ liệu</p>
                            <p className="text-xs text-slate-300 mt-1">Chưa ghi nhận thành tích trong giai đoạn này</p>
                        </div>
                    )}
                </div>

                {/* Top 5 Vi phạm */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                            <TrendingDown className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-sm">Top 5 Vi phạm</h3>
                            <p className="text-xs text-slate-400">Học sinh bị trừ nhiều nhất</p>
                        </div>
                    </div>
                    {stats?.topDeducted?.length > 0 ? (
                        <div className="divide-y divide-slate-50">
                            {stats.topDeducted.map((u: any, i: number) => (
                                <div key={u.userId} className="flex items-center gap-4 px-5 py-3 hover:bg-red-50/50 transition-colors">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm truncate">{u.name}</p>
                                        <p className="text-[11px] text-slate-400">{u.org}</p>
                                    </div>
                                    <span className="font-black text-red-500 text-lg">-{u.points}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                                <Award className="w-7 h-7 text-emerald-200" />
                            </div>
                            <p className="text-sm font-bold text-slate-300">Không có vi phạm</p>
                            <p className="text-xs text-slate-300 mt-1">Tuyệt vời! Chưa có HS nào bị trừ điểm</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal — with Pagination */}
            {showDetail && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden scale-in">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800">Chi tiết biến động điểm</h3>
                                <p className="text-slate-500 text-sm font-medium">Chi tiết biến động điểm {range === 'day' ? 'hôm nay' : range === 'week' ? '7 ngày qua' : 'tháng này'}</p>
                            </div>
                            <button onClick={() => setShowDetail(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        {/* Search + Filter toolbar */}
                        {!isDetailLoading && detailedLogs.length > 0 && (
                            <div className="px-6 py-3 border-b border-slate-100 flex flex-col md:flex-row gap-3 bg-white">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={detailSearch}
                                        onChange={e => { setDetailSearch(e.target.value); setDetailPage(0); }}
                                        placeholder="Tìm theo tên, lớp, nội dung..."
                                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                                    />
                                </div>
                                <div className="flex bg-slate-100 p-1 rounded-xl flex-shrink-0">
                                    {([
                                        { key: 'all', label: 'Tất cả' },
                                        { key: 'boarding', label: 'Nội trú' },
                                        { key: 'event', label: 'Sự kiện' },
                                        { key: 'manual', label: 'Thủ công' }
                                    ] as const).map(f => (
                                        <button
                                            key={f.key}
                                            onClick={() => { setDetailFilter(f.key); setDetailPage(0); }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${detailFilter === f.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-6">
                            {isDetailLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-slate-500 font-bold">Đang tải dữ liệu...</p>
                                </div>
                            ) : detailedLogs.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Award className="w-10 h-10 text-slate-300" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-800">Không có dữ liệu</h4>
                                    <p className="text-slate-500">Không tìm thấy sự thay đổi điểm nào trong khoảng thời gian này.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {paginatedDetailLogs.map((log) => {
                                        const typeInfo = getTypeLabel(log.type);
                                        return (
                                            <div key={log.id} className="group p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 relative overflow-hidden">
                                                        {log.user?.avatar_url ? (
                                                            <img src={log.user.avatar_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold uppercase">
                                                                {log.user?.full_name?.charAt(0) || 'U'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h5 className="font-bold text-slate-900 leading-tight">{log.user?.full_name || 'Người dùng hệ thống'}</h5>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{log.user?.organization || 'N/A'}</span>
                                                            <span className="text-[10px] text-slate-400 font-medium">{new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {new Date(log.created_at).toLocaleDateString('vi-VN')}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex-1 md:px-6">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${typeInfo.color}`}>
                                                            {typeInfo.icon}
                                                            {typeInfo.text}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 line-clamp-1">{log.reason}</p>
                                                </div>

                                                <div className={`text-xl font-black md:w-20 text-right ${log.points >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {log.points >= 0 ? `+${log.points}` : log.points}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            {/* Pagination controls */}
                            <div className="flex items-center gap-2">
                                {totalDetailPages > 1 && (
                                    <>
                                        <button
                                            onClick={() => setDetailPage(p => Math.max(0, p - 1))}
                                            disabled={detailPage === 0}
                                            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs text-slate-500 px-2">
                                            Trang <span className="font-bold text-slate-700">{detailPage + 1}</span> / {totalDetailPages} • {filteredDetailLogs.length} lượt
                                        </span>
                                        <button
                                            onClick={() => setDetailPage(p => Math.min(totalDetailPages - 1, p + 1))}
                                            disabled={detailPage >= totalDetailPages - 1}
                                            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </>
                                )}
                                {totalDetailPages <= 1 && (
                                    <p className="text-xs text-slate-400">{filteredDetailLogs.length} lượt ghi nhận</p>
                                )}
                            </div>
                            <button onClick={() => setShowDetail(false)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                    {(['today', 'week', 'month', 'custom'] as const).map(r => (
                                        <button
                                            key={r}
                                            onClick={() => setExportDateRange(r)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${exportDateRange === r ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {r === 'today' ? 'Hôm nay' : r === 'week' ? 'Tuần' : r === 'month' ? 'Tháng' : 'Tùy chọn'}
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
                                <div className="grid grid-cols-2 gap-2">
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

export default PointStatistics;

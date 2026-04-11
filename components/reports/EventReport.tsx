import React, { useState, useEffect, useMemo, useRef } from 'react';
import { dataService } from '../../services/dataService';
import { Event, EventCheckin } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { Users, CheckCircle, Clock, XCircle, Calendar, MapPin, Download, ChevronLeft, Filter, Search, AlertTriangle, X, BarChart3, Map } from 'lucide-react';
import { useToast } from '../ui';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface EventReportProps {
    eventId?: string;
    onBack?: () => void;
}

interface EventReportData {
    event: Event;
    stats: {
        total_expected: number;
        total_checkins: number;
        on_time: number;
        late: number;
        absent: number;
        excused: number; // Added field
        attendance_rate: number;
    };
    checkins: Array<EventCheckin & { user_name?: string; class_id?: string; user_id?: string }>;
}

const EventReport: React.FC<EventReportProps> = ({ eventId, onBack }) => {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>(eventId || '');
    const [reportData, setReportData] = useState<EventReportData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'list' | 'map'>('overview');
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const [filterClass, setFilterClass] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showAbsenceConfirm, setShowAbsenceConfirm] = useState(false);
    const [selectedAbsentUserIds, setSelectedAbsentUserIds] = useState<string[]>([]);
    const [eventStatusFilter, setEventStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [checkinPage, setCheckinPage] = useState(0);
    const CHECKIN_PAGE_SIZE = 20;
    const toast = useToast();

    useEffect(() => {
        loadEvents();
    }, []);

    useEffect(() => {
        if (selectedEventId) {
            loadReport(selectedEventId);
        }
    }, [selectedEventId]);

    const loadEvents = async () => {
        try {
            const result = await dataService.getEvents();
            if (result.success && result.data) {
                setEvents(result.data);
                if (!selectedEventId && result.data.length > 0) {
                    setSelectedEventId(result.data[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to load events:', error);
        }
    };

    const loadReport = async (eventId: string) => {
        setIsLoading(true);
        try {
            const result = await dataService.getEventReport(eventId);
            if (result.success && result.data) {
                const apiData = result.data;
                const totalParticipants = apiData.totalParticipants; // Now includes everyone
                const totalCheckins = apiData.totalCheckins;
                const attendanceRate = totalParticipants > 0
                    ? Math.round((totalCheckins / totalParticipants) * 100)
                    : 0;

                setReportData({
                    event: apiData.event,
                    stats: {
                        total_expected: totalParticipants,
                        total_checkins: totalCheckins,
                        on_time: apiData.onTimeCount,
                        late: apiData.lateCount,
                        absent: apiData.absentCount,
                        excused: apiData.excusedCount || 0,
                        attendance_rate: attendanceRate
                    },
                    checkins: apiData.checkins
                });
            }
        } catch (error) {
            console.error('Failed to load report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Get list of absent students — separate processed vs unprocessed
    const absentStudents = useMemo(() => {
        if (!reportData) return [];
        return reportData.checkins.filter(c => c.status === 'absent');
    }, [reportData]);

    const processedAbsentIds = useMemo(() => {
        // Students whose points_earned !== 0 have already been processed
        return new Set(absentStudents.filter(s => s.points_earned !== 0 && s.points_earned !== undefined).map(s => s.user_id).filter(Boolean));
    }, [absentStudents]);

    const unprocessedAbsent = useMemo(() => {
        return absentStudents.filter(s => !processedAbsentIds.has(s.user_id || ''));
    }, [absentStudents, processedAbsentIds]);

    // Initialize selected absent users when modal opens — only unprocessed
    const openAbsenceModal = () => {
        setSelectedAbsentUserIds(unprocessedAbsent.map(s => s.user_id).filter(Boolean) as string[]);
        setShowAbsenceConfirm(true);
    };

    const toggleAbsentUser = (userId: string) => {
        setSelectedAbsentUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const toggleAllAbsentUsers = () => {
        const unprocessedIds = unprocessedAbsent.map(s => s.user_id).filter(Boolean) as string[];
        if (selectedAbsentUserIds.length === unprocessedIds.length) {
            setSelectedAbsentUserIds([]);
        } else {
            setSelectedAbsentUserIds(unprocessedIds);
        }
    };

    const handleProcessAbsence = async () => {
        if (!reportData || !selectedEventId || selectedAbsentUserIds.length === 0) {
            toast.error('Vui lòng chọn ít nhất một học sinh để xử lý.');
            return;
        }
        setShowAbsenceConfirm(false);
        setIsProcessing(true);
        try {
            const absentPoints = reportData.event.points_absent || -10;
            const result = await dataService.processEventAbsence(selectedEventId, absentPoints, selectedAbsentUserIds);

            if (result.success) {
                toast.success(result.message || 'Đã xử lý vắng mặt thành công!');
                loadReport(selectedEventId);
            } else {
                toast.error('Lỗi: ' + result.error);
            }
        } catch (error) {
            console.error('Failed to process absence:', error);
            toast.error('Có lỗi xảy ra khi xử lý.');
        } finally {
            setIsProcessing(false);
        }
    };

    const exportToExcel = () => {
        if (!reportData) return;

        const overviewData = [
            ['BÁO CÁO SỰ KIỆN', reportData.event.name],
            ['Thời gian tổ chức', new Date(reportData.event.start_time).toLocaleString('vi-VN')],
            ['Địa điểm', reportData.event.location || 'N/A'],
            [''],
            ['THỐNG KÊ TỔNG QUAN', ''],
            ['Tổng số người dự kiến', reportData.stats.total_expected],
            ['Tổng số đã check-in', reportData.stats.total_checkins],
            ['Đúng giờ', reportData.stats.on_time],
            ['Đi muộn', reportData.stats.late],
            ['Có phép', reportData.stats.excused],
            ['Vắng mặt', reportData.stats.absent],
            ['Tỷ lệ tham gia', `${reportData.stats.attendance_rate}%`]
        ];
        const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);

        const checkinRows = reportData.checkins.map((checkin, index) => ({
            STT: index + 1,
            'Họ và tên': checkin.user_name || checkin.user_id,
            'Lớp/Đơn vị': checkin.class_id || '',
            'Thời gian check-in': checkin.checkin_time ? new Date(checkin.checkin_time).toLocaleString('vi-VN') : '—',
            'Trạng thái': checkin.status === 'on_time' ? 'Đúng giờ' : checkin.status === 'late' ? 'Muộn' : checkin.status === 'excused' ? 'Có phép' : 'Vắng',
            'Điểm số': checkin.points_earned
        }));
        const wsCheckins = XLSX.utils.json_to_sheet(checkinRows);

        const wscols = [
            { wch: 5 },  // STT
            { wch: 30 }, // Name
            { wch: 15 }, // Class
            { wch: 25 }, // Time
            { wch: 15 }, // Status
            { wch: 10 }, // Score
        ];
        wsCheckins['!cols'] = wscols;

        // Sheet 3: Thống kê theo lớp
        const classStatsExport = classStatsData.map((c, i) => ({
            'STT': i + 1,
            'Lớp/Đơn vị': c.name,
            'Đúng giờ': c['Đúng giờ'],
            'Đi muộn': c['Đi muộn'],
            'Vắng mặt': c['Vắng mặt'],
            'Tỷ lệ (%)': c.rate + '%'
        }));
        const wsClassStats = XLSX.utils.json_to_sheet(classStatsExport);
        wsClassStats['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsOverview, 'Tổng quan');
        XLSX.utils.book_append_sheet(wb, wsCheckins, 'Danh sách chi tiết');
        XLSX.utils.book_append_sheet(wb, wsClassStats, 'Theo lớp');

        const fileName = `BaoCao_${reportData.event.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const chartData = useMemo(() => {
        if (!reportData) return [];
        return [
            { name: 'Đúng giờ', value: reportData.stats.on_time, color: '#10B981' }, // Emerald-500
            { name: 'Đi muộn', value: reportData.stats.late, color: '#F59E0B' }, // Amber-500
            { name: 'Vắng mặt', value: reportData.stats.absent, color: '#EF4444' }, // Red-500
            { name: 'Có phép', value: reportData.stats.excused, color: '#6366F1' } // Purple-500
        ];
    }, [reportData]);

    const uniqueClasses = useMemo(() => {
        if (!reportData) return [];
        const classes = new Set(reportData.checkins.map(c => c.class_id).filter(Boolean));
        return Array.from(classes).sort();
    }, [reportData]);

    // Bar Chart data: statistics by class
    const classStatsData = useMemo(() => {
        if (!reportData || uniqueClasses.length === 0) return [];
        return uniqueClasses.map(className => {
            const classCheckins = reportData.checkins.filter(c => c.class_id === className);
            const onTime = classCheckins.filter(c => c.status === 'on_time').length;
            const late = classCheckins.filter(c => c.status === 'late').length;
            const absent = classCheckins.filter(c => c.status === 'absent').length;
            const total = classCheckins.length;
            const rate = total > 0 ? Math.round(((onTime + late) / total) * 100) : 0;
            return {
                name: className as string,
                'Đúng giờ': onTime,
                'Đi muộn': late,
                'Vắng mặt': absent,
                rate
            };
        }).sort((a, b) => b.rate - a.rate); // Sort by attendance rate desc
    }, [reportData, uniqueClasses]);

    const filteredCheckins = useMemo(() => {
        if (!reportData) return [];
        return reportData.checkins.filter(c => {
            const matchClass = filterClass === 'all' || c.class_id === filterClass;
            const matchStatus = filterStatus === 'all' || c.status === filterStatus;
            const matchSearch = !searchQuery ||
                (c.user_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (c.user_id?.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchClass && matchStatus && matchSearch;
        });
    }, [reportData, filterClass, filterStatus, searchQuery]);

    // Paginated checkins
    const paginatedCheckins = useMemo(() => {
        const start = checkinPage * CHECKIN_PAGE_SIZE;
        return filteredCheckins.slice(start, start + CHECKIN_PAGE_SIZE);
    }, [filteredCheckins, checkinPage]);
    const totalCheckinPages = Math.ceil(filteredCheckins.length / CHECKIN_PAGE_SIZE);

    // Filtered events by status
    const filteredEvents = useMemo(() => {
        const now = new Date();
        return events.filter(e => {
            if (eventStatusFilter === 'all') return true;
            const endTime = new Date(e.end_time);
            if (eventStatusFilter === 'completed') return endTime < now;
            return endTime >= now; // active
        });
    }, [events, eventStatusFilter]);

    // Reset pagination when filters change
    useEffect(() => { setCheckinPage(0); }, [filterClass, filterStatus, searchQuery]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <span className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><BarChart3 className="w-6 h-6" /></span>
                        Báo cáo Sự kiện
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 ml-14">Thống kê chi tiết & danh sách điểm danh</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    {onBack && (
                        <button onClick={onBack} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 flex items-center gap-2 transition-colors">
                            <ChevronLeft className="w-5 h-5" /> Quay lại
                        </button>
                    )}
                    <button
                        onClick={exportToExcel}
                        disabled={!reportData}
                        className="flex-1 md:flex-none px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Download className="w-5 h-5" /> Xuất Excel
                    </button>

                    {reportData && reportData.stats.absent > 0 && (
                        unprocessedAbsent.length === 0 ? (
                            <div className="flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="w-5 h-5" />
                                Đã chốt vắng ({processedAbsentIds.size} HS)
                            </div>
                        ) : (
                            <button
                                onClick={openAbsenceModal}
                                disabled={isProcessing}
                                className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${isProcessing
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
                                    }`}
                            >
                                {isProcessing ? (
                                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <XCircle className="w-5 h-5" />
                                )}
                                Chốt vắng mặt ({unprocessedAbsent.length} HS)
                                {processedAbsentIds.size > 0 && (
                                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">đã chốt {processedAbsentIds.size}</span>
                                )}
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Event Selector */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    Chọn sự kiện cần xem
                </label>
                <div className="flex flex-col md:flex-row gap-3">
                    {/* Status filter tabs */}
                    <div className="flex bg-slate-100 rounded-xl p-1 w-fit">
                        {(['all', 'active', 'completed'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setEventStatusFilter(status)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${eventStatusFilter === status ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {status === 'all' ? 'Tất cả' : status === 'active' ? 'Đang diễn ra' : 'Đã kết thúc'}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1">
                        <select
                            value={selectedEventId}
                            onChange={e => setSelectedEventId(e.target.value)}
                            className="w-full px-5 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none font-medium text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                            <option value="">-- Chọn sự kiện ({filteredEvents.length}) --</option>
                            {filteredEvents.map(event => (
                                <option key={event.id} value={event.id}>{event.name} ({new Date(event.start_time).toLocaleDateString('vi-VN')})</option>
                            ))}
                        </select>
                        <div className="absolute top-1/2 right-4 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronLeft className="w-5 h-5 -rotate-90" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Empty State when no event selected */}
            {!reportData && !isLoading && (
                <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Calendar className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-400 mb-2">Chưa chọn sự kiện</h3>
                    <p className="text-slate-400">Vui lòng chọn một sự kiện từ danh sách ở trên để xem báo cáo.</p>
                </div>
            )}

            {reportData && (
                <>
                    {/* Event Info Card */}
                    <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl p-6 shadow-lg shadow-indigo-200 text-white">
                        <div className="flex items-start justify-between mb-4">
                            <h3 className="text-xl font-black flex items-center gap-2">
                                <MapPin className="w-5 h-5 flex-shrink-0" /> {reportData.event.name}
                            </h3>

                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                                <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-1">Thời gian bắt đầu</p>
                                <p className="font-bold">{new Date(reportData.event.start_time).toLocaleString('vi-VN')}</p>
                            </div>
                            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                                <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-1">Thời gian kết thúc</p>
                                <p className="font-bold">{new Date(reportData.event.end_time).toLocaleString('vi-VN')}</p>
                            </div>
                            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                                <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-1">Địa điểm</p>
                                <p className="font-bold flex items-center gap-1"><MapPin className="w-4 h-4" /> {reportData.event.location || 'Chưa xác định'}</p>
                            </div>
                            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                                <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-1">Điểm số (Đúng giờ / Muộn / Vắng)</p>
                                <p className="font-bold">
                                    <span className="text-emerald-300">+{reportData.event.points_on_time}</span>
                                    <span className="mx-1.5 text-white/50">/</span>
                                    <span className="text-amber-300">{reportData.event.points_late > 0 ? '+' : ''}{reportData.event.points_late}</span>
                                    <span className="mx-1.5 text-white/50">/</span>
                                    <span className="text-red-300">{reportData.event.points_absent > 0 ? '+' : ''}{reportData.event.points_absent}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                        <StatCard label="Dự kiến" value={reportData.stats.total_expected} icon={<Users className="w-5 h-5" />} color="slate" />
                        <StatCard label="Check-in" value={reportData.stats.total_checkins} icon={<CheckCircle className="w-5 h-5" />} color="indigo" />
                        <StatCard label="Đúng giờ" value={reportData.stats.on_time} icon={<Clock className="w-5 h-5" />} color="emerald" />
                        <StatCard label="Đi muộn" value={reportData.stats.late} icon={<Clock className="w-5 h-5" />} color="amber" />
                        <StatCard label="Có phép" value={reportData.stats.excused} icon={<Calendar className="w-5 h-5" />} color="indigo" />
                        <StatCard label="Vắng mặt" value={reportData.stats.absent} icon={<XCircle className="w-5 h-5" />} color="red" />
                    </div>

                    {/* Content Tabs */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 min-h-[500px]">
                        <div className="flex border-b border-slate-100 px-6 pt-4 overflow-x-auto">
                            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                                Tổng quan & Biểu đồ
                            </TabButton>
                            <TabButton active={activeTab === 'list'} onClick={() => setActiveTab('list')}>
                                Danh sách chi tiết
                            </TabButton>
                            <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')}>
                                <Map className="w-4 h-4" /> Bản đồ GPS
                            </TabButton>
                        </div>

                        <div className="p-6">
                            {activeTab === 'overview' ? (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                                        <div className="h-80 relative">
                                            <h3 className="font-bold text-slate-800 mb-6 text-center">Phân bố trạng thái check-in</h3>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={chartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={80}
                                                        outerRadius={110}
                                                        paddingAngle={4}
                                                        dataKey="value"
                                                        stroke="none"
                                                    >
                                                        {chartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        formatter={(value: number) => [value, 'Số lượng']}
                                                    />
                                                    <Legend iconType="circle" />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none mt-4">
                                                <p className="text-3xl font-black text-slate-800">{reportData.stats.total_checkins}</p>
                                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Đã check-in</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col justify-center bg-slate-50 rounded-2xl p-8 border border-slate-100">
                                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                                Tỷ lệ tham gia
                                                <span className="bg-white px-2 py-0.5 rounded text-xs border border-slate-200 text-slate-500 font-normal">Attendance Rate</span>
                                            </h3>

                                            <div className="relative pt-6 pb-2">
                                                <div className="flex justify-between items-end mb-2">
                                                    <span className="text-5xl font-black text-indigo-600">{reportData.stats.attendance_rate}%</span>
                                                    <span className="text-sm font-bold text-slate-400">Mục tiêu: 100%</span>
                                                </div>
                                                <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                                                        style={{ width: `${reportData.stats.attendance_rate}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="mt-8 space-y-4">
                                                <InfoRow label="Đúng giờ" value={reportData.stats.on_time} color="bg-emerald-500" percent={reportData.stats.total_expected > 0 ? Math.round(reportData.stats.on_time / reportData.stats.total_expected * 100) : 0} />
                                                <InfoRow label="Đi muộn" value={reportData.stats.late} color="bg-amber-500" percent={reportData.stats.total_expected > 0 ? Math.round(reportData.stats.late / reportData.stats.total_expected * 100) : 0} />
                                                <InfoRow label="Có phép" value={reportData.stats.excused} color="bg-indigo-500" percent={reportData.stats.total_expected > 0 ? Math.round(reportData.stats.excused / reportData.stats.total_expected * 100) : 0} />
                                                <InfoRow label="Vắng mặt" value={reportData.stats.absent} color="bg-red-500" percent={reportData.stats.total_expected > 0 ? Math.round(reportData.stats.absent / reportData.stats.total_expected * 100) : 0} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bar Chart by Class */}
                                    {classStatsData.length > 0 && (
                                        <div className="bg-white rounded-2xl p-6 border border-slate-100 mt-6">
                                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 inline" /> Thống kê theo Lớp / Đơn vị
                                                <span className="bg-indigo-100 px-2 py-0.5 rounded text-xs text-indigo-600 font-bold">{classStatsData.length} lớp</span>
                                            </h3>
                                            <div className="h-80">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={classStatsData} layout="vertical" margin={{ left: 80, right: 20 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                        <XAxis type="number" tick={{ fontSize: 12 }} />
                                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={70} />
                                                        <Tooltip
                                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                            formatter={(value: number, name: string) => [value, name]}
                                                        />
                                                        <Legend iconType="circle" />
                                                        <Bar dataKey="Đúng giờ" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                                                        <Bar dataKey="Đi muộn" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                                                        <Bar dataKey="Vắng mặt" stackId="a" fill="#EF4444" radius={[0, 4, 4, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : activeTab === 'list' ? (
                                <div className="space-y-4 animate-fade-in">
                                    {/* Filters Bar */}
                                    <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <div className="relative w-full md:w-80">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Tìm tên hoặc mã..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>

                                        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                                            <select
                                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                value={filterClass}
                                                onChange={(e) => setFilterClass(e.target.value)}
                                            >
                                                <option value="all">Tất cả lớp/đơn vị</option>
                                                {uniqueClasses.map(c => <option key={c} value={c as string}>{c}</option>)}
                                            </select>

                                            <select
                                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                value={filterStatus}
                                                onChange={(e) => setFilterStatus(e.target.value)}
                                            >
                                                <option value="all">Tất cả trạng thái</option>
                                                <option value="on_time">● Đúng giờ</option>
                                                <option value="late">● Đi muộn</option>
                                                <option value="excused">● Có phép</option>
                                                <option value="absent">● Vắng mặt</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Table with improved scrolling for mobile */}
                                    <div className="overflow-x-auto rounded-2xl border border-slate-100 -mx-4 md:mx-0">
                                        <table className="w-full min-w-[700px]">
                                            <thead>
                                                <tr className="bg-slate-50 text-left border-b border-slate-100">
                                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">STT</th>
                                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Họ tên</th>
                                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Lớp/Đơn vị</th>
                                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Thời gian</th>
                                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center">Trạng thái</th>
                                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right">Điểm</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {filteredCheckins.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                                            <Filter className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                                            <p>Không tìm thấy dữ liệu phù hợp</p>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedCheckins.map((checkin, index) => (
                                                        <tr key={checkin.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-4 text-slate-500 text-sm">{checkinPage * CHECKIN_PAGE_SIZE + index + 1}</td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    {checkin.participants?.avatar_url ? (
                                                                        <img
                                                                            src={checkin.participants.avatar_url}
                                                                            alt=""
                                                                            className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                                                            {(checkin.user_name || 'N').charAt(0).toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                    <span className="font-bold text-slate-900">{checkin.user_name || 'N/A'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-600 text-sm">{checkin.class_id || '—'}</td>
                                                            <td className="px-6 py-4 text-slate-600 text-sm font-variant-numeric tabular-nums">
                                                                {checkin.checkin_time ? new Date(checkin.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <StatusBadge status={checkin.status} />
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <span className={`font-bold ${checkin.points_earned > 0 ? 'text-emerald-600' : checkin.points_earned < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                                    {checkin.points_earned > 0 ? '+' : ''}{checkin.points_earned}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-xs text-slate-400">
                                            Trang <span className="font-bold text-slate-600">{checkinPage + 1}</span> / {totalCheckinPages} • Tổng {filteredCheckins.length} kết quả
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => setCheckinPage(p => Math.max(0, p - 1))}
                                                disabled={checkinPage === 0}
                                                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            {Array.from({ length: Math.min(5, totalCheckinPages) }, (_, i) => {
                                                const start = Math.max(0, Math.min(checkinPage - 2, totalCheckinPages - 5));
                                                const pageNum = start + i;
                                                if (pageNum >= totalCheckinPages) return null;
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCheckinPage(pageNum)}
                                                        className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${checkinPage === pageNum
                                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50'
                                                            }`}
                                                    >
                                                        {pageNum + 1}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                onClick={() => setCheckinPage(p => Math.min(totalCheckinPages - 1, p + 1))}
                                                disabled={checkinPage >= totalCheckinPages - 1}
                                                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                            >
                                                <ChevronLeft className="w-4 h-4 rotate-180" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'map' ? (
                                <GPSMapTab
                                    event={reportData.event}
                                    checkins={reportData.checkins}
                                    mapContainerRef={mapContainerRef}
                                    mapInstanceRef={mapInstanceRef}
                                />
                            ) : null}
                        </div>
                    </div>
                </>
            )}

            {/* Absence Confirmation Modal */}
            {showAbsenceConfirm && reportData && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 flex-shrink-0">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-2xl font-black text-center text-slate-900 mb-3 flex-shrink-0">Chốt vắng mặt?</h3>
                        <p className="text-slate-500 text-center mb-4 font-medium leading-relaxed flex-shrink-0">
                            Hành động này sẽ trừ điểm <span className="text-red-600 font-bold">{Math.abs(reportData.event.points_absent || 10)} điểm</span> cho <span className="text-slate-900 font-bold">{selectedAbsentUserIds.length}/{absentStudents.length} học sinh</span> đã chọn.
                        </p>

                        {/* Absent Students List with Checkboxes */}
                        {absentStudents.length > 0 && (
                            <div className="mb-4 flex-shrink-0">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold text-slate-700">
                                        Danh sách vắng mặt:
                                        {processedAbsentIds.size > 0 && (
                                            <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                ✓ {processedAbsentIds.size} đã chốt
                                            </span>
                                        )}
                                    </span>
                                    {unprocessedAbsent.length > 0 && (
                                        <button
                                            onClick={toggleAllAbsentUsers}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                                        >
                                            {selectedAbsentUserIds.length === unprocessedAbsent.length ? 'Bỏ chọn tất cả' : `Chọn tất cả (${unprocessedAbsent.length})`}
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                                    {absentStudents.map((student) => {
                                        const isProcessed = processedAbsentIds.has(student.user_id || '');
                                        return (
                                            <label
                                                key={student.participant_id || student.id}
                                                className={`flex items-center gap-3 p-3 transition-colors ${isProcessed ? 'bg-emerald-50/50 cursor-default' : 'hover:bg-slate-50 cursor-pointer'}`}
                                            >
                                                {isProcessed ? (
                                                    <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAbsentUserIds.includes(student.user_id || '')}
                                                        onChange={() => toggleAbsentUser(student.user_id || '')}
                                                        className="w-5 h-5 rounded accent-red-600"
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-bold truncate ${isProcessed ? 'text-slate-400' : 'text-slate-900'}`}>
                                                        {student.user_name || 'Không tên'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 truncate">{student.class_id || 'Chưa có lớp'}</p>
                                                </div>
                                                {isProcessed && (
                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full flex-shrink-0">
                                                        Đã chốt ({student.points_earned}đ)
                                                    </span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800 text-sm flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 inline flex-shrink-0" /> Hành động này <strong>không thể hoàn tác</strong>. Hãy đảm bảo đã kiểm tra danh sách điểm danh.
                        </div>

                        <div className="flex gap-3 flex-shrink-0">
                            <button
                                onClick={() => setShowAbsenceConfirm(false)}
                                className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleProcessAbsence}
                                disabled={selectedAbsentUserIds.length === 0}
                                className={`flex-1 py-4 font-black rounded-2xl transition-all shadow-lg active:scale-95 ${selectedAbsentUserIds.length === 0
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'
                                    }`}
                            >
                                Xác nhận ({selectedAbsentUserIds.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-components ---

const StatCard: React.FC<{
    label: string;
    value: number;
    icon: React.ReactNode;
    color: 'slate' | 'indigo' | 'emerald' | 'amber' | 'red';
}> = ({ label, value, icon, color }) => {
    const colors = {
        slate: 'bg-slate-50 text-slate-600 border-slate-100',
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
        red: 'bg-red-50 text-red-600 border-red-100',
    };

    return (
        <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 transition-all hover:shadow-md hover:-translate-y-1`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${colors[color]}`}>
                {icon}
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{value}</p>
        </div>
    );
};

const TabButton: React.FC<{ active: boolean; children: React.ReactNode; onClick: () => void }> = ({ active, children, onClick }) => (
    <button
        onClick={onClick}
        className={`px-6 py-4 font-bold text-sm transition-all border-b-2 ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
    >
        {children}
    </button>
);

const InfoRow: React.FC<{ label: string; value: number; color: string; percent: number }> = ({ label, value, color, percent }) => (
    <div>
        <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-2 font-medium text-slate-600">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                {label}
            </span>
            <span className="font-bold text-slate-900">{value} <span className="text-slate-400 font-normal">({percent}%)</span></span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${color} opacity-80`} style={{ width: `${percent}%` }} />
        </div>
    </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    if (status === 'on_time') return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle className="w-3.5 h-3.5" /> Đúng giờ</span>;
    if (status === 'late') return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Đi muộn</span>;
    if (status === 'excused') return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200"><Calendar className="w-3.5 h-3.5" /> Có phép</span>;
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><XCircle className="w-3.5 h-3.5" /> Vắng mặt</span>;
};

// --- GPS Map Tab Component ---
const haversineDistanceCalc = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const GPSMapTab: React.FC<{
    event: Event;
    checkins: Array<EventCheckin & { user_name?: string; class_id?: string }>;
    mapContainerRef: React.RefObject<HTMLDivElement>;
    mapInstanceRef: React.MutableRefObject<L.Map | null>;
}> = ({ event, checkins, mapContainerRef, mapInstanceRef }) => {

    const gpsCheckins = useMemo(() =>
        checkins.filter(c => c.checkin_latitude && c.checkin_longitude),
        [checkins]);

    const suspiciousCount = useMemo(() => gpsCheckins.filter(c => c.gps_suspicious).length, [gpsCheckins]);
    const outOfRadiusCount = useMemo(() => {
        if (!event.latitude || !event.longitude) return 0;
        const radius = event.radius_meters || 100;
        return gpsCheckins.filter(c => {
            const dist = haversineDistanceCalc(c.checkin_latitude!, c.checkin_longitude!, event.latitude!, event.longitude!);
            return dist > radius;
        }).length;
    }, [gpsCheckins, event]);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Cleanup previous map
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }

        const centerLat = event.latitude || (gpsCheckins[0]?.checkin_latitude || 10.8231);
        const centerLng = event.longitude || (gpsCheckins[0]?.checkin_longitude || 106.6297);

        const map = L.map(mapContainerRef.current).setView([centerLat, centerLng], 16);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Event location circle
        if (event.latitude && event.longitude) {
            const radius = event.radius_meters || 100;

            L.circle([event.latitude, event.longitude], {
                radius,
                color: '#4F46E5',
                fillColor: '#4F46E5',
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '8 4'
            }).addTo(map);

            // Event center marker
            L.circleMarker([event.latitude, event.longitude], {
                radius: 8,
                color: '#4F46E5',
                fillColor: '#4F46E5',
                fillOpacity: 1,
                weight: 2
            }).addTo(map).bindPopup(`<b>📍 ${event.name}</b><br/>Bán kính: ${radius}m`);
        }

        // Check-in markers
        gpsCheckins.forEach(c => {
            const lat = c.checkin_latitude!;
            const lng = c.checkin_longitude!;

            let dist = 0;
            let isOutside = false;
            if (event.latitude && event.longitude) {
                dist = haversineDistanceCalc(lat, lng, event.latitude, event.longitude);
                isOutside = dist > (event.radius_meters || 100);
            }

            // Color: green = valid, red = suspicious, orange = outside radius
            let color = '#10B981'; // green
            let label = 'Hợp lệ';
            if (c.gps_suspicious) {
                color = '#EF4444'; // red
                label = 'GPS đáng ngờ';
            } else if (isOutside) {
                color = '#F59E0B'; // orange
                label = 'Ngoài khu vực';
            }

            const marker = L.circleMarker([lat, lng], {
                radius: 7,
                color,
                fillColor: color,
                fillOpacity: 0.85,
                weight: 2
            }).addTo(map);

            const time = c.checkin_time ? new Date(c.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
            marker.bindPopup(`
                <div style="min-width:180px">
                    <b>${c.user_name || 'N/A'}</b><br/>
                    <span style="color:${color};font-weight:bold">${label}</span><br/>
                    ⏰ ${time}<br/>
                    📏 Cách: <b>${Math.round(dist)}m</b><br/>
                    🎯 Accuracy: <b>${c.checkin_accuracy ? Math.round(c.checkin_accuracy) + 'm' : 'N/A'}</b>
                    ${c.class_id ? `<br/>🏫 ${c.class_id}` : ''}
                </div>
            `);
        });

        // Fit bounds if has markers
        if (gpsCheckins.length > 0) {
            const bounds = L.latLngBounds(gpsCheckins.map(c => [c.checkin_latitude!, c.checkin_longitude!]));
            if (event.latitude && event.longitude) {
                bounds.extend([event.latitude, event.longitude]);
            }
            map.fitBounds(bounds, { padding: [40, 40] });
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [gpsCheckins, event]);

    if (gpsCheckins.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <MapPin className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-400 mb-2">Chưa có dữ liệu GPS</h3>
                <p className="text-slate-400 text-sm">Dữ liệu GPS sẽ hiển thị khi học sinh tự điểm danh qua điện thoại.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase">Có GPS</p>
                    <p className="text-2xl font-black text-slate-900">{gpsCheckins.length}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <p className="text-xs font-bold text-emerald-500 uppercase">Hợp lệ</p>
                    <p className="text-2xl font-black text-emerald-700">{gpsCheckins.length - suspiciousCount - outOfRadiusCount}</p>
                </div>
                <div className={`rounded-xl p-4 border ${outOfRadiusCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                    <p className={`text-xs font-bold uppercase ${outOfRadiusCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Ngoài khu vực</p>
                    <p className={`text-2xl font-black ${outOfRadiusCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{outOfRadiusCount}</p>
                </div>
                <div className={`rounded-xl p-4 border ${suspiciousCount > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                    <p className={`text-xs font-bold uppercase ${suspiciousCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>Đáng ngờ</p>
                    <p className={`text-2xl font-black ${suspiciousCount > 0 ? 'text-red-700' : 'text-slate-900'}`}>{suspiciousCount}</p>
                </div>
            </div>

            {/* Map Container */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '500px' }}>
                <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" /> Vị trí sự kiện</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Hợp lệ</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Ngoài bán kính</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> GPS đáng ngờ</span>
            </div>
        </div>
    );
};

export default EventReport;

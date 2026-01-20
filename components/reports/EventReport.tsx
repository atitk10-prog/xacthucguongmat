import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { Event, EventCheckin } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { Users, CheckCircle, Clock, XCircle, Calendar, MapPin, Download, ChevronLeft, Filter, Search } from 'lucide-react';

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
        attendance_rate: number;
    };
    checkins: Array<EventCheckin & { user_name?: string; class_id?: string }>;
}

const EventReport: React.FC<EventReportProps> = ({ eventId, onBack }) => {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>(eventId || '');
    const [reportData, setReportData] = useState<EventReportData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'list'>('overview');
    const [filterClass, setFilterClass] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

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
            ['Vắng mặt', reportData.stats.absent],
            ['Tỷ lệ tham gia', `${reportData.stats.attendance_rate}%`]
        ];
        const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);

        const checkinRows = reportData.checkins.map((checkin, index) => ({
            STT: index + 1,
            'Họ và tên': checkin.user_name || checkin.user_id,
            'Lớp/Đơn vị': checkin.class_id || '',
            'Thời gian check-in': checkin.checkin_time ? new Date(checkin.checkin_time).toLocaleString('vi-VN') : '—',
            'Trạng thái': checkin.status === 'on_time' ? 'Đúng giờ' : checkin.status === 'late' ? 'Muộn' : 'Vắng',
            'Điểm số': checkin.points_earned
        }));
        const wsCheckins = XLSX.utils.json_to_sheet(checkinRows);

        // Adjust column widths
        const wscols = [
            { wch: 5 },  // STT
            { wch: 30 }, // Name
            { wch: 15 }, // Class
            { wch: 25 }, // Time
            { wch: 15 }, // Status
            { wch: 10 }, // Score
        ];
        wsCheckins['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsOverview, "Tổng quan");
        XLSX.utils.book_append_sheet(wb, wsCheckins, "Danh sách chi tiết");

        const fileName = `BaoCao_${reportData.event.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const chartData = useMemo(() => {
        if (!reportData) return [];
        return [
            { name: 'Đúng giờ', value: reportData.stats.on_time, color: '#10B981' }, // Emerald-500
            { name: 'Đi muộn', value: reportData.stats.late, color: '#F59E0B' }, // Amber-500
            { name: 'Vắng mặt', value: reportData.stats.absent, color: '#EF4444' } // Red-500
        ];
    }, [reportData]);

    const uniqueClasses = useMemo(() => {
        if (!reportData) return [];
        const classes = new Set(reportData.checkins.map(c => c.class_id).filter(Boolean));
        return Array.from(classes).sort();
    }, [reportData]);

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
                        <span className="bg-indigo-100 p-2 rounded-xl text-indigo-600">📊</span>
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
                        className="flex-1 md:flex-none px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                        <Download className="w-5 h-5" /> Xuất Excel
                    </button>
                </div>
            </div>

            {/* Event Selector */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    Chọn sự kiện cần xem
                </label>
                <div className="relative">
                    <select
                        value={selectedEventId}
                        onChange={e => setSelectedEventId(e.target.value)}
                        className="w-full md:w-1/2 px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none font-medium text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                        <option value="">-- Chọn sự kiện --</option>
                        {events.map(event => (
                            <option key={event.id} value={event.id}>{event.name} ({new Date(event.start_time).toLocaleDateString('vi-VN')})</option>
                        ))}
                    </select>
                    <div className="absolute top-1/2 left-[calc(50%-2rem)] md:left-[calc(50%-2rem)] -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronLeft className="w-5 h-5 -rotate-90" />
                    </div>
                </div>
            </div>

            {reportData && (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <StatCard label="Tổng dự kiến" value={reportData.stats.total_expected} icon={<Users className="w-6 h-6" />} color="slate" />
                        <StatCard label="Đã check-in" value={reportData.stats.total_checkins} icon={<CheckCircle className="w-6 h-6" />} color="indigo" />
                        <StatCard label="Đúng giờ" value={reportData.stats.on_time} icon={<Clock className="w-6 h-6" />} color="emerald" />
                        <StatCard label="Đi muộn" value={reportData.stats.late} icon={<Clock className="w-6 h-6" />} color="amber" />
                        <StatCard label="Vắng mặt" value={reportData.stats.absent} icon={<XCircle className="w-6 h-6" />} color="red" />
                    </div>

                    {/* Content Tabs */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-h-[500px]">
                        <div className="flex border-b border-slate-100 px-6 pt-4">
                            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                                Tổng quan & Biểu đồ
                            </TabButton>
                            <TabButton active={activeTab === 'list'} onClick={() => setActiveTab('list')}>
                                Danh sách chi tiết
                            </TabButton>
                        </div>

                        <div className="p-6">
                            {activeTab === 'overview' ? (
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
                                            <InfoRow label="Vắng mặt" value={reportData.stats.absent} color="bg-red-500" percent={reportData.stats.total_expected > 0 ? Math.round(reportData.stats.absent / reportData.stats.total_expected * 100) : 0} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
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
                                                <option value="on_time">✅ Đúng giờ</option>
                                                <option value="late">⚠️ Đi muộn</option>
                                                <option value="absent">❌ Vắng mặt</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-hidden rounded-2xl border border-slate-100">
                                        <table className="w-full">
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
                                                    filteredCheckins.map((checkin, index) => (
                                                        <tr key={checkin.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-4 text-slate-500 text-sm">{index + 1}</td>
                                                            <td className="px-6 py-4 font-bold text-slate-900">{checkin.user_name || 'N/A'}</td>
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
                                    <p className="text-right text-xs text-slate-400 mt-2">Hiển thị {filteredCheckins.length} kết quả</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
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
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><XCircle className="w-3.5 h-3.5" /> Vắng mặt</span>;
};

export default EventReport;

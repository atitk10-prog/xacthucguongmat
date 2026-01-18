import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { Event, EventCheckin } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';

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
                // Calculate attendance rate locally since API doesn't return it directly in correct math format sometimes
                // or just to be safe and match the interface
                const totalParticipants = apiData.totalParticipants;
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

        // Sheet 1: Overview
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

        // Sheet 2: Detailed Check-in List
        const checkinRows = reportData.checkins.map((checkin, index) => ({
            STT: index + 1,
            'Họ và tên': checkin.user_name || checkin.user_id,
            'Lớp/Đơn vị': checkin.class_id || '',
            'Thời gian check-in': new Date(checkin.checkin_time).toLocaleString('vi-VN'),
            'Trạng thái': checkin.status === 'on_time' ? 'Đúng giờ' : 'Muộn',
            'Điểm số': checkin.points_earned
        }));
        const wsCheckins = XLSX.utils.json_to_sheet(checkinRows);

        // Create Workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsOverview, "Tổng quan");
        XLSX.utils.book_append_sheet(wb, wsCheckins, "Danh sách điểm danh");

        // Save file
        const fileName = `BaoCao_${reportData.event.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Derived data for charts
    const chartData = useMemo(() => {
        if (!reportData) return [];
        return [
            { name: 'Đúng giờ', value: reportData.stats.on_time, color: '#10B981' },
            { name: 'Đi muộn', value: reportData.stats.late, color: '#F59E0B' },
            { name: 'Vắng mặt', value: reportData.stats.absent, color: '#EF4444' }
        ];
    }, [reportData]);

    const uniqueClasses = useMemo(() => {
        if (!reportData) return [];
        const classes = new Set(reportData.checkins.map(c => c.class_id).filter(Boolean));
        return Array.from(classes).sort();
    }, [reportData]);

    const filteredCheckins = useMemo(() => {
        if (!reportData) return [];
        if (filterClass === 'all') return reportData.checkins;
        return reportData.checkins.filter(c => c.class_id === filterClass);
    }, [reportData, filterClass]);

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
                    <h2 className="text-3xl font-black text-slate-900">📊 Báo cáo Sự kiện</h2>
                    <p className="text-slate-500 font-medium mt-1">Xem chi tiết điểm danh theo sự kiện</p>
                </div>
                <div className="flex gap-2">
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                            ← Quay lại
                        </button>
                    )}
                    <button
                        onClick={exportToExcel}
                        disabled={!reportData}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <span>📥</span> Xuất Excel
                    </button>
                </div>
            </div>

            {/* Event Selector */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-2">Chọn sự kiện</label>
                <select
                    value={selectedEventId}
                    onChange={e => setSelectedEventId(e.target.value)}
                    className="w-full md:w-96 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="">-- Chọn sự kiện --</option>
                    {events.map(event => (
                        <option key={event.id} value={event.id}>{event.name}</option>
                    ))}
                </select>
            </div>

            {reportData && (
                <>
                    {/* Tabs */}
                    <div className="flex gap-4 border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2 font-bold text-sm transition-colors border-b-2 ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Tổng quan & Biểu đồ
                        </button>
                        <button
                            onClick={() => setActiveTab('list')}
                            className={`px-4 py-2 font-bold text-sm transition-colors border-b-2 ${activeTab === 'list' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Danh sách chi tiết
                        </button>
                    </div>

                    {activeTab === 'overview' ? (
                        <div className="space-y-6 animate-fade-in">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <StatCard label="Dự kiến" value={reportData.stats.total_expected} icon="👥" color="slate" />
                                <StatCard label="Đã check-in" value={reportData.stats.total_checkins} icon="✅" color="indigo" />
                                <StatCard label="Đúng giờ" value={reportData.stats.on_time} icon="⏰" color="emerald" />
                                <StatCard label="Đi muộn" value={reportData.stats.late} icon="⚠️" color="amber" />
                                <StatCard label="Vắng mặt" value={reportData.stats.absent} icon="❌" color="red" />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Chart 1: Attendance Distribution */}
                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 h-80">
                                    <h3 className="font-bold text-slate-900 mb-4">Phân bố điểm danh</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: number) => [value, 'Số lượng']} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Attendance Rate Bar */}
                                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-center">
                                    <div className="text-center mb-6">
                                        <h3 className="font-bold text-slate-900">Tỷ lệ tham gia</h3>
                                        <p className="text-5xl font-black text-indigo-600 mt-2">{reportData.stats.attendance_rate}%</p>
                                        <p className="text-slate-500 text-sm mt-1">trên tổng số {reportData.stats.total_expected} người</p>
                                    </div>
                                    <div className="h-6 bg-slate-100 rounded-full overflow-hidden relative">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
                                            style={{ width: `${reportData.stats.attendance_rate}%` }}
                                        />
                                    </div>
                                    <div className="mt-6 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Đúng giờ</span>
                                            <span className="font-bold">{reportData.stats.on_time}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500" /> Đi muộn</span>
                                            <span className="font-bold">{reportData.stats.late}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /> Vắng mặt</span>
                                            <span className="font-bold">{reportData.stats.absent}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fade-in">
                            {/* Filters */}
                            <div className="flex justify-end">
                                <select
                                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                                    value={filterClass}
                                    onChange={(e) => setFilterClass(e.target.value)}
                                >
                                    <option value="all">Tất cả lớp/đơn vị</option>
                                    {uniqueClasses.map(c => <option key={c} value={c as string}>{c}</option>)}
                                </select>
                            </div>

                            {/* Check-in List */}
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-900">Danh sách điểm danh ({filteredCheckins.length})</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-slate-50 text-left">
                                                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">STT</th>
                                                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Họ tên</th>
                                                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Lớp</th>
                                                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Thời gian</th>
                                                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Trạng thái</th>
                                                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-right">Điểm</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredCheckins.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                                                        <span className="text-4xl">📋</span>
                                                        <p className="mt-2">Không tìm thấy dữ liệu</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredCheckins.map((checkin, index) => (
                                                    <tr key={checkin.id} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                                                        <td className="px-4 py-3 font-bold text-slate-900">{checkin.user_name || checkin.user_id}</td>
                                                        <td className="px-4 py-3 text-slate-500">{checkin.class_id || '—'}</td>
                                                        <td className="px-4 py-3 text-slate-500">{new Date(checkin.checkin_time).toLocaleString('vi-VN')}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${checkin.status === 'on_time' ? 'bg-emerald-100 text-emerald-600' :
                                                                checkin.status === 'late' ? 'bg-amber-100 text-amber-600' :
                                                                    'bg-red-100 text-red-600'
                                                                }`}>
                                                                {checkin.status === 'on_time' ? '✓ Đúng giờ' : checkin.status === 'late' ? '⚠ Muộn' : '✗ Vắng'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={`font-bold ${checkin.points_earned >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {checkin.points_earned >= 0 ? '+' : ''}{checkin.points_earned}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const StatCard: React.FC<{
    label: string;
    value: number;
    icon: string;
    color: 'slate' | 'indigo' | 'emerald' | 'amber' | 'red';
}> = ({ label, value, icon, color }) => {
    const colors = {
        slate: 'bg-slate-50 text-slate-600',
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        red: 'bg-red-50 text-red-600',
    };

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${colors[color]} mb-2`}>
                {icon}
            </div>
            <p className="text-slate-500 text-xs">{label}</p>
            <p className="text-2xl font-black text-slate-900">{value}</p>
        </div>
    );
};

export default EventReport;

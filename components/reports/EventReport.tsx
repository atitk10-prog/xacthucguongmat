import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { Event, EventCheckin } from '../../types';

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
                setReportData(result.data as EventReportData);
            }
        } catch (error) {
            console.error('Failed to load report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const exportToCSV = () => {
        if (!reportData) return;

        const headers = ['STT', 'Họ tên', 'Lớp', 'Thời gian check-in', 'Trạng thái', 'Điểm'];
        const rows = reportData.checkins.map((checkin, index) => [
            index + 1,
            checkin.user_name || checkin.user_id,
            checkin.class_id || '',
            new Date(checkin.checkin_time).toLocaleString('vi-VN'),
            checkin.status === 'on_time' ? 'Đúng giờ' : checkin.status === 'late' ? 'Muộn' : 'Vắng',
            checkin.points_earned
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bao_cao_${reportData.event.name}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
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
                        onClick={exportToCSV}
                        disabled={!reportData}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50"
                    >
                        📥 Xuất CSV
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
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <StatCard label="Dự kiến" value={reportData.stats.total_expected} icon="👥" color="slate" />
                        <StatCard label="Đã check-in" value={reportData.stats.total_checkins} icon="✅" color="indigo" />
                        <StatCard label="Đúng giờ" value={reportData.stats.on_time} icon="⏰" color="emerald" />
                        <StatCard label="Đi muộn" value={reportData.stats.late} icon="⚠️" color="amber" />
                        <StatCard label="Vắng mặt" value={reportData.stats.absent} icon="❌" color="red" />
                    </div>

                    {/* Attendance Rate */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-900">Tỷ lệ tham gia</h3>
                            <span className="text-3xl font-black text-indigo-600">{reportData.stats.attendance_rate}%</span>
                        </div>
                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                                style={{ width: `${reportData.stats.attendance_rate}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Check-in List */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900">Danh sách điểm danh ({reportData.checkins.length})</h3>
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
                                    {reportData.checkins.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                                                <span className="text-4xl">📋</span>
                                                <p className="mt-2">Chưa có dữ liệu check-in</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        reportData.checkins.map((checkin, index) => (
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

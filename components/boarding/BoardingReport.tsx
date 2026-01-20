import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { Icons } from '../ui';
import {
    Calendar, Download, Filter, ChevronLeft, ChevronRight,
    CheckCircle, XCircle, Clock, AlertTriangle, Users
} from 'lucide-react';

interface CheckinRecord {
    id: string;
    user_id: string;
    date: string;
    morning_in?: string;
    morning_in_status?: string;
    morning_out?: string;
    noon_in?: string;
    noon_in_status?: string;
    noon_out?: string;
    evening_in?: string;
    evening_in_status?: string;
    evening_out?: string;
    user?: {
        full_name: string;
        student_code: string;
        organization: string;
    };
}

interface BoardingReportProps {
    onBack?: () => void;
}

const BoardingReport: React.FC<BoardingReportProps> = ({ onBack }) => {
    const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterOrg, setFilterOrg] = useState('');
    const [organizations, setOrganizations] = useState<string[]>([]);

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await dataService.getBoardingCheckins({ date: selectedDate });
            if (res.success && res.data) {
                setCheckins(res.data as CheckinRecord[]);
                // Extract unique organizations
                const orgs = [...new Set(res.data.map(c => c.user?.organization).filter(Boolean))] as string[];
                setOrganizations(orgs.sort());
            }
        } catch (err) {
            console.error('Failed to load boarding report:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter by organization
    const filteredCheckins = filterOrg
        ? checkins.filter(c => c.user?.organization === filterOrg)
        : checkins;

    // Stats
    const stats = {
        total: filteredCheckins.length,
        onTime: filteredCheckins.filter(c =>
            c.morning_in_status === 'on_time' || c.noon_in_status === 'on_time' || c.evening_in_status === 'on_time'
        ).length,
        late: filteredCheckins.filter(c =>
            c.morning_in_status === 'late' || c.noon_in_status === 'late' || c.evening_in_status === 'late'
        ).length
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const getStatusBadge = (status?: string) => {
        if (!status) return null;
        if (status === 'on_time') {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold"><CheckCircle className="w-3 h-3" /> Đúng giờ</span>;
        }
        if (status === 'late') {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold"><AlertTriangle className="w-3 h-3" /> Trễ</span>;
        }
        return null;
    };

    const handleDateChange = (delta: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + delta);
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    const exportToExcel = () => {
        // Simple CSV export
        const headers = ['Họ tên', 'Mã HS', 'Lớp', 'Sáng vào', 'Sáng ra', 'Trưa vào', 'Trưa ra', 'Tối vào', 'Tối ra'];
        const rows = filteredCheckins.map(c => [
            c.user?.full_name || '',
            c.user?.student_code || '',
            c.user?.organization || '',
            formatTime(c.morning_in),
            formatTime(c.morning_out),
            formatTime(c.noon_in),
            formatTime(c.noon_out),
            formatTime(c.evening_in),
            formatTime(c.evening_out)
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diem-danh-noi-tru-${selectedDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <Icons.Reports className="w-6 h-6 text-indigo-600" />
                        Báo Cáo Điểm Danh
                    </h2>
                    <p className="text-slate-500 mt-1">Xem chi tiết điểm danh nội trú theo ngày</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportToExcel}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Xuất Excel
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
                {/* Date Picker */}
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
                    <button onClick={() => handleDateChange(-1)} className="p-2 hover:bg-white rounded-lg transition-colors">
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="bg-transparent px-2 py-1 font-bold text-slate-900 focus:outline-none"
                    />
                    <button onClick={() => handleDateChange(1)} className="p-2 hover:bg-white rounded-lg transition-colors">
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                </div>

                {/* Org Filter */}
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={filterOrg}
                        onChange={e => setFilterOrg(e.target.value)}
                        className="bg-slate-100 border-0 rounded-lg px-3 py-2 font-medium text-slate-700"
                    >
                        <option value="">Tất cả lớp</option>
                        {organizations.map(org => (
                            <option key={org} value={org}>{org}</option>
                        ))}
                    </select>
                </div>

                {/* Stats */}
                <div className="flex gap-4 ml-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-indigo-700">{stats.total}</span>
                        <span className="text-indigo-500 text-sm">check-in</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-emerald-700">{stats.onTime}</span>
                        <span className="text-emerald-500 text-sm">đúng giờ</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="font-bold text-amber-700">{stats.late}</span>
                        <span className="text-amber-500 text-sm">trễ</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-12 flex items-center justify-center">
                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : filteredCheckins.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-medium">Không có dữ liệu điểm danh cho ngày này</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold">Học sinh</th>
                                    <th className="px-4 py-3 text-left font-bold">Mã HS</th>
                                    <th className="px-4 py-3 text-left font-bold">Lớp</th>
                                    <th className="px-4 py-3 text-center font-bold">Sáng vào</th>
                                    <th className="px-4 py-3 text-center font-bold">Sáng ra</th>
                                    <th className="px-4 py-3 text-center font-bold">Trưa vào</th>
                                    <th className="px-4 py-3 text-center font-bold">Trưa ra</th>
                                    <th className="px-4 py-3 text-center font-bold">Tối vào</th>
                                    <th className="px-4 py-3 text-center font-bold">Tối ra</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredCheckins.map(checkin => (
                                    <tr key={checkin.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-900">{checkin.user?.full_name || '-'}</td>
                                        <td className="px-4 py-3 font-mono text-slate-600">{checkin.user?.student_code || '-'}</td>
                                        <td className="px-4 py-3 text-indigo-600 font-bold">{checkin.user?.organization || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className={checkin.morning_in ? 'text-slate-900' : 'text-slate-300'}>{formatTime(checkin.morning_in)}</span>
                                                {getStatusBadge(checkin.morning_in_status)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-600">{formatTime(checkin.morning_out)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className={checkin.noon_in ? 'text-slate-900' : 'text-slate-300'}>{formatTime(checkin.noon_in)}</span>
                                                {getStatusBadge(checkin.noon_in_status)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-600">{formatTime(checkin.noon_out)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className={checkin.evening_in ? 'text-slate-900' : 'text-slate-300'}>{formatTime(checkin.evening_in)}</span>
                                                {getStatusBadge(checkin.evening_in_status)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-600">{formatTime(checkin.evening_out)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BoardingReport;

import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { BoardingTimeSlot } from '../../types';
import { Icons, useToast } from '../ui';
import {
    Calendar, Download, Filter, ChevronLeft, ChevronRight,
    CheckCircle, XCircle, Clock, AlertTriangle, Users, MinusCircle, RefreshCw
} from 'lucide-react';

interface CheckinRecord {
    id: string;
    user_id: string;
    date: string;
    slots?: Record<string, {
        time?: string;
        status?: string;
        name: string;
    }>;
    user?: {
        full_name: string;
        student_code: string;
        organization: string;
    };
    // Keep legacy for safety during transition
    morning_in?: string;
    morning_in_status?: string;
}

interface BoardingReportProps {
    onBack?: () => void;
}

const BoardingReport: React.FC<BoardingReportProps> = ({ onBack }) => {
    const { success: toastSuccess, error: toastError } = useToast();
    const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterOrg, setFilterOrg] = useState('');
    const [organizations, setOrganizations] = useState<string[]>([]);
    const [timeSlots, setTimeSlots] = useState<BoardingTimeSlot[]>([]);

    // Process Absent Modal State
    const [showAbsentModal, setShowAbsentModal] = useState(false);
    const [absentSlotId, setAbsentSlotId] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processResult, setProcessResult] = useState<{
        processed: number;
        pointsDeducted: number;
        students: { name: string; code: string; organization: string }[]
    } | null>(null);

    // Process Late Modal State
    const [showLateModal, setShowLateModal] = useState(false);
    const [lateSlotId, setLateSlotId] = useState<string>('');
    const [isProcessingLate, setIsProcessingLate] = useState(false);
    const [lateProcessResult, setLateProcessResult] = useState<{
        processed: number;
        pointsDeducted: number;
        students: { id: string; name: string; code: string; organization: string; checkinTime: string }[]
    } | null>(null);

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    // Load time slots on mount
    useEffect(() => {
        const loadTimeSlots = async () => {
            const res = await dataService.getActiveTimeSlots();
            if (res.success && res.data) {
                setTimeSlots(res.data);
                if (res.data.length > 0) {
                    setAbsentSlotId(res.data[0].id);
                    setLateSlotId(res.data[0].id);
                }
            }
        };
        loadTimeSlots();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await dataService.getBoardingCheckins({ date: selectedDate });
            if (res.success && res.data) {
                console.log('Boarding Checkins Data:', res.data); // Debugging
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

    // Stats calculation...
    const stats = {
        total: filteredCheckins.length,
        onTime: filteredCheckins.filter(c =>
            c.morning_in_status === 'on_time' || c.noon_in_status === 'on_time' || c.afternoon_in_status === 'on_time' || c.evening_in_status === 'on_time' ||
            // Check dynamic statuses if any
            Object.keys(c).some(k => k.endsWith('_status') && c[k] === 'on_time')
        ).length,
        late: filteredCheckins.filter(c =>
            c.morning_in_status === 'late' || c.noon_in_status === 'late' || c.afternoon_in_status === 'late' || c.evening_in_status === 'late' ||
            Object.keys(c).some(k => k.endsWith('_status') && c[k] === 'late')
        ).length
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatSlotTime = (timeStr: string) => {
        return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true
        });
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
        const headers = ['STT', 'Họ tên', 'Mã HS', 'Lớp'];
        if (timeSlots.length > 0) {
            timeSlots.forEach(slot => headers.push(slot.name));
        } else {
            headers.push('Sáng vào', 'Trưa vào', 'Chiều vào', 'Tối vào');
        }

        const rows = filteredCheckins.map((c, index) => {
            const row = [
                `${index + 1}`,
                c.user?.full_name || '',
                c.user?.student_code || '',
                c.user?.organization || ''
            ];

            if (timeSlots.length > 0) {
                timeSlots.forEach(slot => {
                    const slotData = c.slots?.[slot.id];
                    row.push(slotData ? formatTime(slotData.time) : '-');
                });
            } else {
                row.push(
                    formatTime(c.morning_in),
                    formatTime((c as any).noon_in),
                    formatTime((c as any).afternoon_in),
                    formatTime((c as any).evening_in)
                );
            }
            return row;
        });

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diem-danh-noi-tru-${selectedDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Handle processing absent students
    const handleProcessAbsent = async () => {
        if (!absentSlotId) return;
        setIsProcessing(true);
        setProcessResult(null);

        try {
            const res = await dataService.processAbsentStudents(selectedDate, absentSlotId);
            if (res.success && res.data) {
                setProcessResult(res.data);
                toastSuccess(`Đã xử lý ${res.data.processed} học sinh vắng`);
            } else {
                toastError(res.error || 'Lỗi xử lý');
            }
        } catch (err: any) {
            toastError(err.message || 'Lỗi hệ thống');
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle viewing/processing late students
    const handleProcessLate = async () => {
        if (!lateSlotId) return;
        setIsProcessingLate(true);
        setLateProcessResult(null);

        try {
            const res = await dataService.processLateStudents(selectedDate, lateSlotId);
            if (res.success && res.data) {
                setLateProcessResult(res.data as any);
                toastSuccess(`Đã xử lý ${res.data.processed} học sinh đi muộn`);
                loadData();
            } else {
                toastError(res.error || 'Lỗi xử lý');
            }
        } catch (err: any) {
            toastError(err.message || 'Lỗi hệ thống');
        } finally {
            setIsProcessingLate(false);
        }
    };

    // Determine which columns to show
    const useTimeSlots = timeSlots.length > 0;

    // Helper to render cell data safely
    const renderCellData = (checkin: CheckinRecord, slot: BoardingTimeSlot) => {
        const slotData = checkin.slots?.[slot.id];
        const timeIn = slotData?.time;
        const status = slotData?.status;

        if (!timeIn) return <span className="text-slate-300">-</span>;

        return (
            <>
                <span className="text-slate-900">{formatTime(timeIn)}</span>
                {getStatusBadge(status)}
            </>
        );
    };

    // Modal UI for Absent Processing
    const renderAbsentModal = () => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
                <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Xử lý học sinh vắng</h3>
                        <p className="text-sm text-slate-500 mt-1">Hệ thống sẽ tự động trừ điểm học sinh vắng mặt không phép</p>
                    </div>
                    <button onClick={() => setShowAbsentModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <XCircle className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                <div className="p-8">
                    {!processResult ? (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Chọn khung giờ xử lý</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {timeSlots.map(slot => (
                                        <button
                                            key={slot.id}
                                            onClick={() => setAbsentSlotId(slot.id)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${absentSlotId === slot.id
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md translate-y-[-2px]'
                                                : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'
                                                }`}
                                        >
                                            <Clock className={`w-5 h-5 ${absentSlotId === slot.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                                            <span className="font-bold">{slot.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-4">
                                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                                <div className="text-sm text-amber-800">
                                    <p className="font-bold">Lưu ý:</p>
                                    <ul className="list-disc ml-4 space-y-1 mt-1">
                                        <li>Điểm trừ sẽ được áp dụng trực tiếp cho học sinh vắng mặt.</li>
                                        <li>Hệ thống sẽ bỏ qua học sinh có <b>đơn xin phép</b> đã được duyệt.</li>
                                        <li>Hành động này không thể hoàn tác.</li>
                                    </ul>
                                </div>
                            </div>

                            <button
                                onClick={handleProcessAbsent}
                                disabled={isProcessing}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isProcessing ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        Đang xử lý...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        Bắt đầu xử lý vắng mặt
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-3xl p-6">
                                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                                    <CheckCircle className="w-10 h-10" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-lg font-bold text-emerald-800">Xử lý thành công!</h4>
                                    <p className="text-emerald-700">Đã trừ <b>{processResult.pointsDeducted} điểm</b> cho <b>{processResult.processed} học sinh</b>.</p>
                                </div>
                            </div>

                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex justify-between">
                                    <span>Danh sách học sinh vắng</span>
                                    <span className="bg-slate-200 text-slate-600 px-2 rounded-lg text-xs flex items-center">{processResult.students.length} người</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50 text-xs text-slate-400 uppercase font-bold sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2 text-left">Họ tên</th>
                                                <th className="px-4 py-2 text-left">Lớp</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {processResult.students.map((s, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-4 py-2 text-sm font-medium text-slate-700">{s.name}</td>
                                                    <td className="px-4 py-2 text-sm text-slate-500">{s.organization}</td>
                                                </tr>
                                            ))}
                                            {processResult.students.length === 0 && (
                                                <tr>
                                                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400 italic">Không có học sinh nào vắng mặt.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setShowAbsentModal(false);
                                    setProcessResult(null);
                                    loadData();
                                }}
                                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg transition-all"
                            >
                                Đóng và Quay lại
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // Modal UI for Late Processing
    const renderLateModal = () => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
                <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Xử lý học sinh đi muộn</h3>
                        <p className="text-sm text-slate-500 mt-1">Đã tự động trừ điểm trong lúc check-in</p>
                    </div>
                    <button onClick={() => setShowLateModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <XCircle className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                <div className="p-8">
                    {!lateProcessResult ? (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Chọn khung giờ kiểm tra</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {timeSlots.map(slot => (
                                        <button
                                            key={slot.id}
                                            onClick={() => setLateSlotId(slot.id)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${lateSlotId === slot.id
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md translate-y-[-2px]'
                                                : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'
                                                }`}
                                        >
                                            <Clock className={`w-5 h-5 ${lateSlotId === slot.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                                            <span className="font-bold">{slot.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleProcessLate}
                                disabled={isProcessingLate}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isProcessingLate ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        Đang tải dữ liệu...
                                    </>
                                ) : (
                                    <>
                                        <Filter className="w-5 h-5" />
                                        Xem danh sách học sinh muộn
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="text-lg font-bold text-slate-800">Danh sách học sinh muộn ({lateProcessResult.students.length})</h4>
                                <div className="flex gap-2 text-sm">
                                    <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold">-{lateProcessResult.pointsDeducted} điểm/người</span>
                                </div>
                            </div>

                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="max-h-80 overflow-y-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50 text-xs text-slate-400 uppercase font-bold sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Học sinh</th>
                                                <th className="px-4 py-3 text-left">Lớp</th>
                                                <th className="px-4 py-3 text-left">Check-in lúc</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {lateProcessResult.students.map((s, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{s.name}</td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">{s.organization}</td>
                                                    <td className="px-4 py-3 font-mono text-amber-600 font-bold text-sm">
                                                        {formatTime(s.checkinTime)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {lateProcessResult.students.length === 0 && (
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-12 text-center text-slate-400 italic">Hôm nay không có học sinh nào đi muộn.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setLateProcessResult(null)}
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-4 rounded-2xl transition-all"
                                >
                                    Quay lại
                                </button>
                                <button
                                    onClick={() => {
                                        setShowLateModal(false);
                                        setLateProcessResult(null);
                                    }}
                                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-2xl transition-all"
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <Icons.Reports className="w-6 h-6 text-indigo-600" />
                        Báo Cáo Điểm Danh
                    </h2>
                    <p className="text-slate-500 mt-1">
                        Xem chi tiết điểm danh nội trú theo ngày
                        {timeSlots.length > 0 && <span className="text-indigo-600 font-medium ml-2">({timeSlots.length} khung giờ)</span>}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setProcessResult(null);
                            setShowAbsentModal(true);
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 transition-colors shadow-sm"
                    >
                        <MinusCircle className="w-4 h-4" />
                        Xử lý vắng
                    </button>
                    <button
                        onClick={() => {
                            setLateProcessResult(null);
                            setShowLateModal(true);
                        }}
                        className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-amber-700 transition-colors shadow-sm"
                    >
                        <Clock className="w-4 h-4" />
                        Xử lý đi muộn
                    </button>
                    <button
                        onClick={exportToExcel}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-sm"
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

            {/* Time Slots Legend */}
            {timeSlots.length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 flex flex-wrap gap-3">
                    <span className="text-indigo-700 font-bold text-sm flex items-center gap-1">
                        <Clock className="w-4 h-4" /> Khung giờ:
                    </span>
                    {timeSlots.map(slot => (
                        <span key={slot.id} className="bg-white px-3 py-1 rounded-lg text-sm font-medium text-slate-700 border border-indigo-200">
                            {slot.name}: {slot.start_time} - {slot.end_time}
                        </span>
                    ))}
                </div>
            )}

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
                        <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-center font-bold w-12">STT</th>
                                    <th className="px-4 py-3 text-left font-bold">Học sinh</th>
                                    <th className="px-4 py-3 text-left font-bold">Mã HS</th>
                                    <th className="px-4 py-3 text-left font-bold w-32 text-indigo-600">Lớp</th>
                                    {timeSlots.map(slot => (
                                        <th key={slot.id} className="px-4 py-3 text-center font-bold">
                                            {slot.name}
                                        </th>
                                    ))}
                                    {timeSlots.length === 0 && (
                                        <>
                                            <th className="px-4 py-3 text-center font-bold">Sáng</th>
                                            <th className="px-4 py-3 text-center font-bold">Trưa</th>
                                            <th className="px-4 py-3 text-center font-bold">Chiều</th>
                                            <th className="px-4 py-3 text-center font-bold">Tối</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredCheckins.map((checkin, index) => (
                                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-center text-slate-400 font-mono">{index + 1}</td>
                                        <td className="px-4 py-3 font-bold text-slate-900">{checkin.user?.full_name || '-'}</td>
                                        <td className="px-4 py-3 text-slate-600 font-mono uppercase">{checkin.user?.student_code || '-'}</td>
                                        <td className="px-4 py-3 text-indigo-600 font-bold">{checkin.user?.organization || '-'}</td>
                                        {timeSlots.length > 0 ? (
                                            timeSlots.map(slot => (
                                                <td key={slot.id} className="px-4 py-3 text-center">
                                                    {renderCellData(checkin, slot)}
                                                </td>
                                            ))
                                        ) : (
                                            <>
                                                <td className="px-4 py-3 text-center">
                                                    {checkin.morning_in ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-mono">{formatTime(checkin.morning_in)}</span>
                                                            <span className={`text-[10px] font-bold ${checkin.morning_in_status === 'late' ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                {checkin.morning_in_status === 'late' ? 'MUỘN' : 'OK'}
                                                            </span>
                                                        </div>
                                                    ) : '-'}
                                                </td>
                                                {/* Add other legacy cells if needed, or just focus on slot-based */}
                                                <td className="px-4 py-3 text-center text-slate-300">-</td>
                                                <td className="px-4 py-3 text-center text-slate-300">-</td>
                                                <td className="px-4 py-3 text-center text-slate-300">-</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showAbsentModal && renderAbsentModal()}
            {showLateModal && renderLateModal()}
        </div>
    );
};

export default BoardingReport;

import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import {
    Users, CheckCircle, AlertTriangle, Clock, TrendingUp,
    UserCheck, XCircle, Calendar, ArrowUp, ArrowDown, Home
} from 'lucide-react';

// ... existing code ...

// ... existing code ...

interface DashboardStats {
    totalStudents: number;
    checkedInToday: number;
    lateToday: number;
    notCheckedIn: number;
    onTimeRate: number;
}

interface RecentCheckin {
    name: string;
    time: string;
    type: string;
    status: 'on_time' | 'late';
    organization?: string;
}

interface RoomStat {
    id: string;
    name: string;
    zone: string;
    capacity: number;
    current: number;
    checkedIn: number;
    percent: number;
}

interface BoardingDashboardProps {
    onNavigate?: (tab: string) => void;
}

const BoardingDashboard: React.FC<BoardingDashboardProps> = ({ onNavigate }) => {
    const [stats, setStats] = useState<DashboardStats>({
        totalStudents: 0,
        checkedInToday: 0,
        lateToday: 0,
        notCheckedIn: 0,
        onTimeRate: 0
    });
    const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([]);
    const [notCheckedInStudents, setNotCheckedInStudents] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [roomStats, setRoomStats] = useState<RoomStat[]>([]);
    const [roomZones, setRoomZones] = useState<string[]>([]);
    const [selectedRoomZone, setSelectedRoomZone] = useState('all');

    // Room Detail Modal State
    const [selectedRoom, setSelectedRoom] = useState<RoomStat | null>(null);
    const [allStudents, setAllStudents] = useState<User[]>([]);
    const [checkedInSet, setCheckedInSet] = useState<Set<string>>(new Set());

    // Update clock every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        loadDashboardData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(loadDashboardData, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadDashboardData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Load all students
            const studentsRes = await dataService.getAllStudentsForCheckin(false);
            const allStudentsData = studentsRes.data || [];

            // Load today's checkins
            const checkinsRes = await dataService.getBoardingCheckins({ date: today });
            const todayCheckins = checkinsRes.data || [];

            // Load Rooms
            const roomsRes = await dataService.getRooms();
            const rooms = roomsRes.success && roomsRes.data ? roomsRes.data : [];

            // Calculate stats
            const checkedInIds = new Set(todayCheckins.map(c => c.user_id));
            const notCheckedIn = allStudentsData.filter(s => !checkedInIds.has(s.id));

            // Save state for detailed view
            setAllStudents(allStudentsData);
            setCheckedInSet(checkedInIds);

            // Count late checkins
            const lateCount = todayCheckins.filter(c =>
                c.morning_in_status === 'late' ||
                c.noon_in_status === 'late' ||
                c.evening_in_status === 'late'
            ).length;

            const onTimeCount = todayCheckins.length - lateCount;
            const onTimeRate = todayCheckins.length > 0
                ? Math.round((onTimeCount / todayCheckins.length) * 100)
                : 100;

            setStats({
                totalStudents: allStudents.length,
                checkedInToday: todayCheckins.length,
                lateToday: lateCount,
                notCheckedIn: notCheckedIn.length,
                onTimeRate
            });

            setNotCheckedInStudents(notCheckedIn.slice(0, 10)); // Show first 10

            // Recent checkins (last 5)
            const recent: RecentCheckin[] = todayCheckins
                .sort((a, b) => {
                    const getLatestTime = (c: any) => {
                        const times = [c.morning_in, c.noon_in, c.evening_in, c.morning_out, c.noon_out, c.evening_out].filter(Boolean);
                        return times.length > 0 ? new Date(times[times.length - 1]).getTime() : 0;
                    };
                    return getLatestTime(b) - getLatestTime(a);
                })
                .slice(0, 5)
                .map(c => {
                    let type = '';
                    let status: 'on_time' | 'late' = 'on_time';
                    let time = '';

                    if (c.evening_in) {
                        type = 'Tối vào';
                        status = c.evening_in_status === 'late' ? 'late' : 'on_time';
                        time = new Date(c.evening_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    } else if (c.noon_in) {
                        type = 'Trưa vào';
                        status = c.noon_in_status === 'late' ? 'late' : 'on_time';
                        time = new Date(c.noon_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    } else if (c.morning_in) {
                        type = 'Sáng vào';
                        status = c.morning_in_status === 'late' ? 'late' : 'on_time';
                        time = new Date(c.morning_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    }

                    return {
                        name: c.user?.full_name || 'N/A',
                        time,
                        type,
                        status,
                        organization: c.user?.organization
                    };
                });

            setRecentCheckins(recent);

            // Calculate Room Stats
            if (rooms.length > 0) {
                const checkedInUserIds = new Set(todayCheckins.map(c => c.user_id));
                const uniqueZones = new Set<string>();

                const calculatedRoomStats: RoomStat[] = rooms.map(room => {
                    if (room.zone) uniqueZones.add(room.zone);

                    if (room.zone) uniqueZones.add(room.zone);

                    const roomStudents = allStudentsData.filter(s => s.room_id === room.id);
                    const current = roomStudents.length;

                    // Count how many of these students have checked in today
                    const checkedInCount = roomStudents.filter(s => checkedInUserIds.has(s.id)).length;

                    return {
                        id: room.id,
                        name: room.name,
                        zone: room.zone || 'Other',
                        capacity: room.capacity || 8,
                        current: current,
                        checkedIn: checkedInCount,
                        percent: current > 0 ? Math.round((checkedInCount / current) * 100) : 0
                    };
                });

                setRoomStats(calculatedRoomStats);
                setRoomZones(Array.from(uniqueZones).sort());
            }
        } catch (err) {
            console.error('Failed to load dashboard:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getTimeOfDay = () => {
        const hour = currentTime.getHours();
        if (hour >= 5 && hour < 12) return { label: 'Buổi sáng', icon: '🌅' };
        if (hour >= 12 && hour < 17) return { label: 'Buổi trưa', icon: '☀️' };
        if (hour >= 17 && hour < 21) return { label: 'Buổi tối', icon: '🌆' };
        return { label: 'Đêm khuya', icon: '🌙' };
    };

    const timeOfDay = getTimeOfDay();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Dashboard Nội Trú</h2>
                    <p className="text-slate-500 flex items-center gap-2 mt-1">
                        <span>{timeOfDay.icon}</span>
                        {timeOfDay.label} • {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Cập nhật tự động
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Students */}
                <button
                    onClick={() => onNavigate?.('config')}
                    className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                            <Users className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.totalStudents}</p>
                            <p className="text-slate-500 text-sm font-medium">Tổng học sinh</p>
                        </div>
                    </div>
                </button>

                {/* Checked In Today */}
                <button
                    onClick={() => onNavigate?.('report')}
                    className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                            <UserCheck className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.checkedInToday}</p>
                            <p className="text-slate-500 text-sm font-medium">Đã check-in</p>
                        </div>
                    </div>
                </button>

                {/* Late Today */}
                <button
                    onClick={() => onNavigate?.('report')}
                    className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                            <AlertTriangle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.lateToday}</p>
                            <p className="text-slate-500 text-sm font-medium">Trễ hôm nay</p>
                        </div>
                    </div>
                </button>

                {/* On-time Rate */}
                <button
                    onClick={() => onNavigate?.('report')}
                    className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.onTimeRate}%</p>
                            <p className="text-slate-500 text-sm font-medium">Tỷ lệ đúng giờ</p>
                        </div>
                    </div>
                </button>
            </div>

            {/* Two Column Content */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Checkins */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-slate-400" />
                            Check-in Gần Đây
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {recentCheckins.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <Clock className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                <p>Chưa có check-in hôm nay</p>
                            </div>
                        ) : (
                            recentCheckins.map((checkin, i) => (
                                <div key={i} className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${checkin.status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}>
                                        {checkin.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-900">{checkin.name}</p>
                                        <p className="text-sm text-slate-500">{checkin.organization || ''}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-sm text-slate-900">{checkin.time}</p>
                                        <p className={`text-xs font-bold ${checkin.status === 'late' ? 'text-amber-600' : 'text-emerald-600'
                                            }`}>
                                            {checkin.type} • {checkin.status === 'late' ? 'Trễ' : 'Đúng giờ'}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Not Checked In Alert */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-red-50/50">
                        <h3 className="font-bold text-red-900 flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-500" />
                            Chưa Check-in Hôm Nay
                            <span className="ml-auto bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                {stats.notCheckedIn}
                            </span>
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                        {notCheckedInStudents.length === 0 ? (
                            <div className="p-8 text-center text-emerald-600">
                                <CheckCircle className="w-10 h-10 mx-auto mb-2" />
                                <p className="font-bold">Tất cả đã check-in!</p>
                            </div>
                        ) : (
                            notCheckedInStudents.map((student, i) => (
                                <div key={i} className="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold text-sm">
                                        {student.full_name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-slate-900 text-sm">{student.full_name}</p>
                                        <p className="text-xs text-slate-500">{student.organization || student.student_code}</p>
                                    </div>
                                </div>
                            ))
                        )}
                        {stats.notCheckedIn > 10 && (
                            <div className="p-3 text-center text-slate-500 text-sm">
                                Và {stats.notCheckedIn - 10} học sinh khác...
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Check-in by Class/Organization */}
            {recentCheckins.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            Thống Kê Theo Lớp
                            <span className="ml-auto text-xs text-slate-500 font-normal">Hôm nay</span>
                        </h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Group by organization */}
                        {(() => {
                            const orgStats: Record<string, { total: number; late: number }> = {};
                            recentCheckins.forEach(c => {
                                const org = c.organization || 'Khác';
                                if (!orgStats[org]) orgStats[org] = { total: 0, late: 0 };
                                orgStats[org].total++;
                                if (c.status === 'late') orgStats[org].late++;
                            });
                            return Object.entries(orgStats).slice(0, 4).map(([org, data]) => (
                                <div key={org} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p className="text-sm font-bold text-slate-900 truncate" title={org}>{org}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-lg font-black text-indigo-600">{data.total}</span>
                                        <span className="text-xs text-slate-500">check-in</span>
                                        {data.late > 0 && (
                                            <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full font-bold">
                                                {data.late} trễ
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            )}

            {/* Room Stats Section */}
            {roomStats.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Home className="w-5 h-5 text-indigo-600" />
                            Thống Kê Theo Phòng
                        </h3>

                        {/* Zone Filter */}
                        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setSelectedRoomZone('all')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${selectedRoomZone === 'all' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                            >
                                Tất cả
                            </button>
                            {roomZones.map(zone => (
                                <button
                                    key={zone}
                                    onClick={() => setSelectedRoomZone(zone)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${selectedRoomZone === zone ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                                >
                                    Khu {zone}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {roomStats
                            .filter(r => selectedRoomZone === 'all' || r.zone === selectedRoomZone)
                            .map(room => (
                                <div
                                    key={room.id}
                                    onClick={() => setSelectedRoom(room)}
                                    className="bg-slate-50 rounded-xl p-3 border border-slate-100 relative overflow-hidden group hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all"
                                >
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="text-xs text-slate-500 font-bold uppercase">Khu {room.zone}</div>
                                                <div className="text-lg font-black text-slate-900">{room.name}</div>
                                            </div>
                                            <div className={`px-2 py-0.5 rounded text-xs font-bold text-white
                                                ${room.percent >= 90 ? 'bg-emerald-500' : room.percent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}>
                                                {room.percent}%
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <span className="text-xs text-slate-500">Đã check-in</span>
                                            <span className="font-bold text-slate-900 text-sm">
                                                {room.checkedIn}/{room.current}
                                            </span>
                                        </div>

                                        <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${room.percent >= 90 ? 'bg-emerald-500' : room.percent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                style={{ width: `${room.percent}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Room Detail Modal */}
            {selectedRoom && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center">
                                    <span className="text-xl font-black text-indigo-600">{selectedRoom.name}</span>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Chi tiết phòng {selectedRoom.name}</h3>
                                    <p className="text-slate-500">Khu {selectedRoom.zone} • {selectedRoom.checkedIn}/{selectedRoom.current} đã về</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedRoom(null)}
                                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
                            >
                                <XCircle className="w-6 h-6 text-slate-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
                            {/* Stats Summary */}
                            <div className="flex gap-2 mb-4">
                                <div className="flex-1 bg-emerald-50 p-3 rounded-xl border border-emerald-100 items-center justify-center flex flex-col">
                                    <span className="text-2xl font-black text-emerald-600">{selectedRoom.checkedIn}</span>
                                    <span className="text-xs font-bold text-emerald-700 uppercase">Đã về</span>
                                </div>
                                <div className="flex-1 bg-red-50 p-3 rounded-xl border border-red-100 items-center justify-center flex flex-col">
                                    <span className="text-2xl font-black text-red-600">{selectedRoom.current - selectedRoom.checkedIn}</span>
                                    <span className="text-xs font-bold text-red-700 uppercase">Chưa về</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {allStudents
                                    .filter(s => s.room_id === selectedRoom.id)
                                    .sort((a, b) => {
                                        // Sort: Not checked in first, then by name
                                        const aChecked = checkedInSet.has(a.id);
                                        const bChecked = checkedInSet.has(b.id);
                                        if (aChecked === bChecked) return a.full_name.localeCompare(b.full_name);
                                        return aChecked ? 1 : -1;
                                    })
                                    .map(student => {
                                        const isCheckedIn = checkedInSet.has(student.id);
                                        return (
                                            <div key={student.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isCheckedIn ? 'bg-slate-50 border-slate-100' : 'bg-red-50 border-red-100'}`}>
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${isCheckedIn ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                                    {student.full_name.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-slate-900">{student.full_name}</p>
                                                    <p className="text-sm text-slate-500">{student.student_code}</p>
                                                </div>
                                                <div className={`px-3 py-1 rounded-lg text-xs font-bold ${isCheckedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {isCheckedIn ? 'Đã về' : 'Chưa về'}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            {selectedRoom.current === 0 && (
                                <div className="text-center py-8 text-slate-400">
                                    <p>Phòng trống (Chưa có học sinh)</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoardingDashboard;

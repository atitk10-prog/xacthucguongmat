import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { BoardingTimeSlot, User, BoardingCheckin } from '../../types';
import {
    Users, CheckCircle, AlertTriangle, Clock, TrendingUp,
    UserCheck, XCircle, Calendar, ArrowUp, ArrowDown, Home, RefreshCw,
    PieChart, Activity, LogIn, ExternalLink
} from 'lucide-react';

// Remove redundant // ... existing code ... placeholders if any

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
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [roomStats, setRoomStats] = useState<RoomStat[]>([]);
    const [roomZones, setRoomZones] = useState<string[]>([]);
    const [selectedRoomZone, setSelectedRoomZone] = useState('all');

    // NEW: Leave states
    const [onLeaveStudents, setOnLeaveStudents] = useState<Set<string>>(new Set());
    const [onLeaveUserRecords, setOnLeaveUserRecords] = useState<User[]>([]);

    // Room Detail Modal State
    const [selectedRoom, setSelectedRoom] = useState<RoomStat | null>(null);
    const [allStudents, setAllStudents] = useState<User[]>([]);
    const [checkedInSet, setCheckedInSet] = useState<Set<string>>(new Set());
    const [timeSlots, setTimeSlots] = useState<BoardingTimeSlot[]>([]);
    const [roomsMap, setRoomsMap] = useState<Record<string, string>>({});
    const [selectedSlotId, setSelectedSlotId] = useState<string>('all');
    const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

    // Raw data storage for processing
    const [rawData, setRawData] = useState<{
        students: User[];
        checkins: BoardingCheckin[];
        rooms: any[];
        leaveRequests: any[];
    } | null>(null);

    // Update clock every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        loadDashboardData();

        // Supabase Realtime Subscription
        const channel = supabase
            .channel('boarding_dashboard_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'boarding_checkins' },
                () => {
                    console.log('Realtime change detected');
                    loadDashboardData(true); // Silent refresh
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const loadDashboardData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);

        try {
            const today = new Date().toISOString().split('T')[0];

            // Parallel loading for maximum speed
            const [studentsRes, checkinsRes, slotsRes, roomsRes, leaveRes] = await Promise.all([
                dataService.getAllStudentsForCheckin(false),
                dataService.getBoardingCheckins({ date: today }),
                dataService.getTimeSlots(),
                dataService.getRooms(),
                dataService.getExitPermissions({ status: 'approved', startDate: today })
            ]);

            const allStudentsData = studentsRes.data || [];
            const todayCheckins = checkinsRes.data || [];
            const slots = (slotsRes.data || []).sort((a, b) => a.order_index - b.order_index);
            const rooms = roomsRes.success && roomsRes.data ? roomsRes.data : [];
            const leaveRequests = leaveRes.data || [];

            setTimeSlots(slots);


            // Create rooms lookup map
            const rMap: Record<string, string> = {};
            rooms.forEach(r => {
                rMap[r.id] = r.name;
            });
            setRoomsMap(rMap);

            // Store raw data for instant filtering
            setRawData({
                students: allStudentsData,
                checkins: todayCheckins,
                rooms: rooms,
                leaveRequests: leaveRequests
            });

        } catch (err) {
            console.error('Failed to load dashboard:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    // NEW: Processing effect for instant tab switching
    useEffect(() => {
        if (!rawData) return;

        const { students: allStudentsData, checkins: todayCheckins, rooms, leaveRequests } = rawData;
        const onLeaveIds = new Set(leaveRequests.map((req: any) => req.user_id));
        setOnLeaveStudents(onLeaveIds);

        const leaveUsers = allStudentsData.filter(s => onLeaveIds.has(s.id));
        setOnLeaveUserRecords(leaveUsers);

        // Calculate stats based on selected SLOT
        const getCheckinBySlot = (studentId: string, slotId: string) => {
            const checkin = todayCheckins.find(c => c.user_id === studentId);
            if (!checkin || !checkin.slots) return null;
            return checkin.slots[slotId];
        };

        const checkedInInSlot = allStudentsData.filter(s => {
            if (selectedSlotId === 'all') {
                const checkin = todayCheckins.find(c => c.user_id === s.id);
                return checkin && checkin.slots && Object.keys(checkin.slots).length > 0;
            }
            return getCheckinBySlot(s.id, selectedSlotId);
        });

        const checkedInIdsInSlot = new Set(checkedInInSlot.map(s => s.id));
        const lateInSlot = checkedInInSlot.filter(s => {
            if (selectedSlotId === 'all') {
                const checkin = todayCheckins.find(c => c.user_id === s.id);
                return checkin && Object.values(checkin.slots || {}).some((sl: any) => sl.status === 'late');
            }
            const slotData = getCheckinBySlot(s.id, selectedSlotId);
            return slotData && slotData.status === 'late';
        });

        const notCheckedIn = allStudentsData.filter(s => !checkedInIdsInSlot.has(s.id) && !onLeaveIds.has(s.id));

        // Save state
        setAllStudents(allStudentsData);
        setCheckedInSet(checkedInIdsInSlot);

        let totalSlotCheckins = 0;
        let lateCount = 0;

        if (selectedSlotId === 'all') {
            todayCheckins.forEach(c => {
                if (c.slots) {
                    Object.values(c.slots).forEach((s: any) => {
                        totalSlotCheckins++;
                        if (s.status === 'late') lateCount++;
                    });
                }
            });
        } else {
            totalSlotCheckins = checkedInInSlot.length;
            lateCount = lateInSlot.length;
        }

        const onTimeRate = totalSlotCheckins > 0
            ? Math.round(((totalSlotCheckins - lateCount) / totalSlotCheckins) * 100)
            : 100;

        setStats({
            totalStudents: allStudentsData.length,
            checkedInToday: checkedInIdsInSlot.size,
            lateToday: lateCount,
            notCheckedIn: notCheckedIn.length,
            onTimeRate
        });

        setNotCheckedInStudents(notCheckedIn.slice(0, 10));

        // Recent checkins
        interface FlatSlotCheckin extends RecentCheckin {
            timestamp: number;
        }

        const flatRecent: FlatSlotCheckin[] = [];
        todayCheckins.forEach(c => {
            if (c.slots) {
                Object.entries(c.slots).forEach(([slotId, s]: [string, any]) => {
                    if (selectedSlotId !== 'all' && slotId !== selectedSlotId) return;
                    if (s.time) {
                        flatRecent.push({
                            name: c.user?.full_name || 'Học sinh',
                            organization: c.user?.organization,
                            time: new Date(s.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                            type: s.name,
                            status: s.status === 'late' ? 'late' : 'on_time',
                            timestamp: new Date(s.time).getTime()
                        });
                    }
                });
            }
        });

        setRecentCheckins(flatRecent.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8));

        // Calculate Room Stats
        const uniqueZones = new Set<string>();
        const calculatedRoomStats: RoomStat[] = rooms.map(room => {
            if (room.zone) uniqueZones.add(room.zone);
            const roomStudents = allStudentsData.filter(s => s.room_id === room.id);
            const current = roomStudents.length;
            const checkedInCount = roomStudents.filter(s => checkedInIdsInSlot.has(s.id)).length;
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

    }, [rawData, selectedSlotId]);

    // AUTO-DETECT ACTIVE SLOT (Reactive to time)
    useEffect(() => {
        if (timeSlots.length === 0) return;

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        // 1. First priority: Strictly active sessions
        const strictlyActive = timeSlots.find(slot =>
            timeStr >= slot.start_time && timeStr <= slot.end_time
        );

        if (strictlyActive) {
            setActiveSlotId(strictlyActive.id);
            if (selectedSlotId === 'all') setSelectedSlotId(strictlyActive.id);
            return;
        }

        // 2. Second priority: Sessions that just ended (within 1 hour)
        const justEnded = timeSlots.find(slot => {
            const endParts = slot.end_time.split(':');
            const endHour = parseInt(endParts[0]);
            const endMin = parseInt(endParts[1]);

            const endTime = new Date();
            endTime.setHours(endHour, endMin, 0);

            const diffMs = now.getTime() - endTime.getTime();
            const oneHourMs = 60 * 60 * 1000;

            return diffMs > 0 && diffMs <= oneHourMs;
        });

        if (justEnded) {
            setActiveSlotId(justEnded.id);
            if (selectedSlotId === 'all') setSelectedSlotId(justEnded.id);
            return;
        }

        setActiveSlotId(null);
    }, [currentTime, timeSlots]);

    const getTimeOfDay = () => {
        const hour = currentTime.getHours();
        if (hour >= 5 && hour < 11) return { label: 'Buổi sáng', icon: '🌅' };
        if (hour >= 11 && hour < 14) return { label: 'Buổi trưa', icon: '☀️' };
        if (hour >= 14 && hour < 18) return { label: 'Buổi chiều', icon: '🌇' };
        if (hour >= 18 && hour < 22) return { label: 'Buổi tối', icon: '🌆' };
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 truncate">Dashboard Nội Trú</h2>
                    <p className="text-slate-500 flex items-center gap-2 mt-1 text-sm sm:text-base truncate">
                        <span>{timeOfDay.icon}</span>
                        {timeOfDay.label} • {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isRefreshing ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                        {isRefreshing ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        )}
                        {isRefreshing ? 'Đang cập nhật...' : 'Live Sync'}
                    </div>
                </div>
            </div>

            {/* Session Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                <button
                    onClick={() => setSelectedSlotId('all')}
                    className={`px-5 py-2.5 rounded-2xl font-bold flex-shrink-0 transition-all ${selectedSlotId === 'all'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 scale-105'
                        : 'bg-white text-slate-500 border border-slate-100 hover:border-indigo-200'
                        }`}
                >
                    Toàn bộ hôm nay
                </button>
                {timeSlots.map(slot => (
                    <button
                        key={slot.id}
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={`px-5 py-2.5 rounded-2xl font-bold flex-shrink-0 transition-all relative ${selectedSlotId === slot.id
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 scale-105'
                            : 'bg-white text-slate-500 border border-slate-100 hover:border-indigo-200'
                            }`}
                    >
                        {slot.name}
                        {activeSlotId === slot.id && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white"></span>
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Students */}
                <button
                    onClick={() => onNavigate?.('config')}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-200 transition-colors flex-shrink-0">
                            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{stats.totalStudents}</p>
                            <p className="text-slate-500 text-[10px] sm:text-sm font-medium truncate mt-1">Tổng học sinh</p>
                        </div>
                    </div>
                </button>

                {/* Checked In Today */}
                <button
                    onClick={() => onNavigate?.('report')}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors flex-shrink-0">
                            <UserCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{stats.checkedInToday}</p>
                            <p className="text-slate-500 text-[10px] sm:text-sm font-medium truncate mt-1">Đã check-in</p>
                        </div>
                    </div>
                </button>

                {/* Late Today */}
                <button
                    onClick={() => onNavigate?.('report')}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all text-left group"
                >
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{stats.lateToday}</p>
                            <p className="text-slate-500 text-[10px] sm:text-sm font-medium truncate mt-1">Trễ hôm nay</p>
                        </div>
                    </div>
                </button>

                {/* On-time Rate */}
                <button
                    onClick={() => onNavigate?.('report')}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left group relative overflow-hidden"
                >
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Activity className="w-20 h-20 sm:w-24 sm:h-24 text-blue-600" />
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 relative z-10">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors flex-shrink-0">
                            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{stats.onTimeRate}%</p>
                            <p className="text-slate-500 text-[10px] sm:text-sm font-medium truncate mt-1">Tỷ lệ đúng giờ</p>
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
                                <div key={i} className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 hover:bg-slate-50 transition-colors">
                                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-sm sm:text-base ${checkin.status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}>
                                        {checkin.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm sm:text-base truncate">{checkin.name}</p>
                                        <p className="text-xs text-slate-500 truncate">{checkin.organization || ''}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-mono text-[10px] sm:text-sm text-slate-900">{checkin.time}</p>
                                        <p className={`text-[9px] sm:text-xs font-bold truncate ${checkin.status === 'late' ? 'text-amber-600' : 'text-emerald-600'
                                            }`}>
                                            {checkin.status === 'late' ? 'Trễ' : 'Đúng giờ'}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Not Checked In / On Leave Alert */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-red-50/50">
                            <h3 className="font-bold text-red-900 flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-red-500" />
                                Chưa Check-in
                                <span className="ml-auto bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                    {stats.notCheckedIn} vắng
                                </span>
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                            {notCheckedInStudents.length === 0 ? (
                                <div className="p-8 text-center text-emerald-600">
                                    <CheckCircle className="w-10 h-10 mx-auto mb-2" />
                                    <p className="font-bold">Tất cả đã check-in!</p>
                                </div>
                            ) : (
                                notCheckedInStudents.map((student, i) => (
                                    <div key={i} className="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold text-xs sm:text-sm flex-shrink-0">
                                            {student.full_name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{student.full_name}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{student.organization || student.student_code}</p>
                                        </div>
                                        <div className="text-[10px] font-bold text-red-400 flex-shrink-0">Chưa về</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Approved Leave Section */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-blue-50/50">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                <ExternalLink className="w-5 h-5 text-blue-500" />
                                Học Sinh Vắng Có Phép
                                <span className="ml-auto bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                    {onLeaveUserRecords.length} đơn
                                </span>
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto">
                            {onLeaveUserRecords.length === 0 ? (
                                <div className="p-4 text-center text-slate-400 text-sm italic">
                                    Không có học sinh nào vắng có phép hôm nay
                                </div>
                            ) : (
                                onLeaveUserRecords.map((student, i) => (
                                    <div key={i} className="p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0">
                                            {student.full_name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{student.full_name}</p>
                                            <p className="text-[10px] text-slate-500 truncate">
                                                {student.room_id ? (roomsMap[student.room_id] || student.room_id) : 'Nội trú'}
                                            </p>
                                        </div>
                                        <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] sm:text-[10px] font-bold uppercase flex-shrink-0">
                                            Có phép
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
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

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {roomStats
                            .filter(r => selectedRoomZone === 'all' || r.zone === selectedRoomZone)
                            .map(room => {
                                // Color based on checkedIn / total in room
                                const isFull = room.checkedIn >= room.current && room.current > 0;
                                const isEmpty = room.checkedIn === 0 && room.current > 0;

                                return (
                                    <div
                                        key={room.id}
                                        onClick={() => setSelectedRoom(room)}
                                        className={`rounded-2xl p-4 border relative overflow-hidden group hover:shadow-lg cursor-pointer transition-all duration-300 ${isFull ? 'bg-emerald-50 border-emerald-100 hover:border-emerald-300' : isEmpty ? 'bg-red-50 border-red-100 hover:border-red-300' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
                                    >
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <div className={`text-[10px] font-black uppercase tracking-wider ${isFull ? 'text-emerald-500' : isEmpty ? 'text-red-500' : 'text-slate-400'}`}>Khu {room.zone}</div>
                                                    <div className="text-xl font-black text-slate-900 leading-tight">{room.name}</div>
                                                </div>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isFull ? 'bg-emerald-500 text-white' : isEmpty ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                    {isFull ? <CheckCircle className="w-5 h-5" /> : isEmpty ? <XCircle className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center mt-4">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">Trạng thái</div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-lg font-black text-slate-900">{room.checkedIn}</span>
                                                    <span className="text-slate-400 font-bold">/</span>
                                                    <span className="text-slate-500 font-bold">{room.current}</span>
                                                </div>
                                            </div>

                                            <div className="w-full h-1.5 bg-slate-200/50 rounded-full mt-2 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ${isFull ? 'bg-emerald-500' : isEmpty ? 'bg-red-500' : 'bg-indigo-500'}`}
                                                    style={{ width: `${room.percent}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        {/* Background Decoration */}
                                        <div className="absolute top-0 right-0 p-1 opacity-10">
                                            <Home className="w-12 h-12 -mr-4 -mt-4 text-slate-900 rotate-12" />
                                        </div>
                                    </div>
                                );
                            })}
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
                                        const isOnLeave = onLeaveStudents.has(student.id);

                                        return (
                                            <div key={student.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isCheckedIn ? 'bg-emerald-50 border-emerald-100' : isOnLeave ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${isCheckedIn ? 'bg-emerald-500' : isOnLeave ? 'bg-blue-500' : 'bg-red-500'}`}>
                                                    {student.full_name.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-slate-900">{student.full_name}</p>
                                                    <p className="text-sm text-slate-500">{student.student_code}</p>
                                                </div>
                                                <div className={`px-3 py-1 rounded-lg text-xs font-bold ${isCheckedIn ? 'bg-emerald-100 text-emerald-700' : isOnLeave ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                    {isCheckedIn ? 'Đã về' : isOnLeave ? 'Có phép' : 'Chưa về'}
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

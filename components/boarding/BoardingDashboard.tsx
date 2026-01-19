import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import {
    Users, CheckCircle, AlertTriangle, Clock, TrendingUp,
    UserCheck, XCircle, Calendar, ArrowUp, ArrowDown
} from 'lucide-react';

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

const BoardingDashboard: React.FC = () => {
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
            const allStudents = studentsRes.data || [];

            // Load today's checkins
            const checkinsRes = await dataService.getBoardingCheckins({ date: today });
            const todayCheckins = checkinsRes.data || [];

            // Calculate stats
            const checkedInIds = new Set(todayCheckins.map(c => c.user_id));
            const notCheckedIn = allStudents.filter(s => !checkedInIds.has(s.id));

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
                        time = new Date(c.evening_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    } else if (c.noon_in) {
                        type = 'Trưa vào';
                        status = c.noon_in_status === 'late' ? 'late' : 'on_time';
                        time = new Date(c.noon_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    } else if (c.morning_in) {
                        type = 'Sáng vào';
                        status = c.morning_in_status === 'late' ? 'late' : 'on_time';
                        time = new Date(c.morning_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <Users className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.totalStudents}</p>
                            <p className="text-slate-500 text-sm font-medium">Tổng học sinh</p>
                        </div>
                    </div>
                </div>

                {/* Checked In Today */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <UserCheck className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.checkedInToday}</p>
                            <p className="text-slate-500 text-sm font-medium">Đã check-in</p>
                        </div>
                    </div>
                </div>

                {/* Late Today */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.lateToday}</p>
                            <p className="text-slate-500 text-sm font-medium">Trễ hôm nay</p>
                        </div>
                    </div>
                </div>

                {/* On-time Rate */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-slate-900">{stats.onTimeRate}%</p>
                            <p className="text-slate-500 text-sm font-medium">Tỷ lệ đúng giờ</p>
                        </div>
                    </div>
                </div>
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
        </div>
    );
};

export default BoardingDashboard;

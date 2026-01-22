import React, { useEffect, useState } from 'react';
import { QrCode, FileText, Award, BarChart2, Calendar, User as UserIcon, Bell, Megaphone, ArrowRight, CheckCircle, XCircle, Clock, AlertTriangle, MapPin, Play, Pause, TrendingUp, TrendingDown } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { useToast } from '../ui/Toast';
import { User, Event, BoardingConfig } from '../../types';

interface StudentDashboardProps {
    user: User;
    onNavigate: (tab: any) => void;
}

export default function StudentDashboard({ user, onNavigate }: StudentDashboardProps) {
    const [history, setHistory] = useState<any[]>([]);
    const [todayRecord, setTodayRecord] = useState<any>(null);
    const [myEvents, setMyEvents] = useState<(Event & { eventStatus: string })[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNotif, setShowNotif] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [pointStats, setPointStats] = useState<any>(null);
    const [timeSlots, setTimeSlots] = useState<any[]>([]);
    const toast = useToast();

    // Fresh user data from database (for points, etc.)
    const [currentPoints, setCurrentPoints] = useState(user.total_points || 0);

    // Config from dynamic slots instead of static legacy table
    const [boardingConfig, setBoardingConfig] = useState<BoardingConfig>({
        morning_curfew: '07:00',
        noon_curfew: '12:30',
        evening_curfew: '22:00' // Default fallbacks
    });

    useEffect(() => {
        loadData();
    }, [user]);

    useEffect(() => {
        if (!user) return;

        // Subscribe to real-time notifications
        const channel = dataService.subscribeToNotifications(user.id, (payload) => {
            // console.log('Real-time notification update:', payload);
            if (payload.eventType === 'INSERT') {
                toast.success(payload.new.message || 'Bạn có thông báo mới!');
            }
            loadData(); // Auto refresh all data when a notification is received
        });

        return () => {
            if (channel) channel.unsubscribe();
        };
    }, [user]);

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // 0. Fetch fresh user data for current points
            const userRes = await dataService.getUser(user.id);
            if (userRes.success && userRes.data) {
                setCurrentPoints(userRes.data.total_points || 0);
            }

            // 1. Fetch Config Source: Time Slots (Priority)
            const slotsRes = await dataService.getActiveTimeSlots();
            if (slotsRes.success && slotsRes.data) {
                setTimeSlots(slotsRes.data);
            }

            // 1. Fetch History & Today
            const historyRes = await dataService.getBoardingCheckins({ userId: user.id });
            if (historyRes.success && historyRes.data) {
                const todayStr = new Date().toLocaleDateString('en-CA');
                const today = historyRes.data.find((r: any) => r.date === todayStr);
                setTodayRecord(today || { date: todayStr });
                setHistory(historyRes.data.filter((r: any) => r.date !== todayStr).slice(0, 5));
            }

            // 2. Fetch Events WHERE student is a participant
            const eventsRes = await dataService.getEvents();
            if (eventsRes.success && eventsRes.data) {
                const now = new Date();
                const studentEvents: (Event & { eventStatus: string })[] = [];

                for (const event of eventsRes.data) {
                    // Check if student is a participant
                    const participantsRes = await dataService.getEventParticipants(event.id);
                    if (participantsRes.success && participantsRes.data) {
                        const isParticipant = participantsRes.data.some(
                            (p: any) => p.user_id === user.id || p.email === user.email
                        );

                        if (isParticipant) {
                            // Determine event status
                            const startTime = new Date(event.start_time);
                            const endTime = new Date(event.end_time);
                            let eventStatus = 'upcoming';

                            if (now >= startTime && now <= endTime) {
                                eventStatus = 'ongoing';
                            } else if (now > endTime) {
                                eventStatus = 'ended';
                            }

                            studentEvents.push({ ...event, eventStatus });
                        }
                    }
                }

                // Sort: ongoing first, then upcoming, then ended
                studentEvents.sort((a, b) => {
                    const order = { ongoing: 0, upcoming: 1, ended: 2 };
                    return order[a.eventStatus as keyof typeof order] - order[b.eventStatus as keyof typeof order];
                });

                setMyEvents(studentEvents.slice(0, 5));
            }

            // 3. Fetch Notifications from DB (includes point changes & alerts)
            const notifRes = await dataService.getNotifications(user.id, 20);
            if (notifRes.success && notifRes.data) {
                const formattedNotifications = notifRes.data.map((notif: any) => ({
                    id: notif.id,
                    type: notif.type,
                    title: notif.title,
                    message: notif.message,
                    time: notif.created_at,
                    isRead: notif.is_read
                }));

                // Sort by time, newest first
                formattedNotifications.sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());

                setNotifications(formattedNotifications.slice(0, 10));
                const unread = formattedNotifications.filter((n: any) => !n.isRead).length;
                setUnreadCount(unread);
            } else if (notifRes.error) {
                console.error('getNotifications error:', notifRes.error);
            }

            // 4. Fetch Point Statistics for the student
            const statsRes = await dataService.getPointStatistics({ range: 'week', userId: user.id });
            if (statsRes.success) {
                setPointStats(statsRes.data);
            }

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenNotif = async () => {
        setShowNotif(!showNotif);
        if (unreadCount > 0 && user) {
            setUnreadCount(0); // Optimistically clear unread count
            // Mark notifications as read in database
            await dataService.markNotificationsRead(user.id);
            // Re-fetch to update the `isRead` status in the displayed notifications
            loadData();
        }
    };

    const QuickAction = ({ icon, label, target, color }: any) => (
        <button
            onClick={() => onNavigate(target)}
            className="flex flex-col items-center justify-center p-3 sm:p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.05)] border border-gray-100 active:scale-95 transition-all hover:bg-gray-50 flex-1"
        >
            <div className={`p-2 sm:p-3 rounded-xl ${color} text-white mb-2 shadow-sm`}>
                {icon}
            </div>
            <span className="text-[10px] sm:text-xs font-semibold text-gray-700 text-center">{label}</span>
        </button>
    );

    const TimeSlot = ({ label, timeIn, deadline, slotType, startTimeStr }: any) => {
        const isDone = !!timeIn;
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeVal = currentHour * 60 + currentMinutes;

        const [deadH, deadM] = deadline.split(':').map(Number);
        const deadlineVal = deadH * 60 + deadM;

        const [startH, startM] = (startTimeStr || "00:00").split(':').map(Number);
        const startVal = startH * 60 + startM;

        // Determine Status
        let status = 'upcoming'; // default
        let statusText = 'Sắp tới';
        let statusColor = 'bg-gray-50 text-gray-400 border-gray-100';
        let icon = <Clock size={16} />;
        let mainTimeDisplay = '--:--';

        if (isDone) {
            // Already checked in
            const checkinDate = new Date(timeIn);
            const inH = checkinDate.getHours();
            const inM = checkinDate.getMinutes();
            const checkinVal = inH * 60 + inM;
            mainTimeDisplay = `${inH.toString().padStart(2, '0')}:${inM.toString().padStart(2, '0')}`;

            if (checkinVal <= deadlineVal) {
                status = 'ontime';
                statusText = 'Đúng giờ';
                statusColor = 'bg-green-50 text-green-700 border-green-200 shadow-sm';
                icon = <CheckCircle size={16} className="text-green-600" />;
            } else {
                status = 'late';
                statusText = 'Trễ';
                statusColor = 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm';
                icon = <AlertTriangle size={16} className="text-orange-600" />;
            }
        } else {
            // Not checked in yet
            if (currentTimeVal > deadlineVal) {
                // Past deadline
                status = 'absent';
                statusText = 'Trễ/Vắng';
                statusColor = 'bg-red-50 text-red-600 border-red-100';
                icon = <XCircle size={16} />;
            } else if (currentTimeVal >= startVal) {
                // Currently open
                status = 'open';
                statusText = 'Đang mở';
                statusColor = 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse ring-1 ring-blue-200';
                icon = <Clock size={16} />;
            } else {
                // Future
                status = 'upcoming';
                statusText = 'Chưa đến';
            }
        }

        return (
            <div className={`flex flex-col p-3 rounded-2xl border ${statusColor} transition-all w-full relative overflow-hidden`}>
                <div className="flex justify-between items-start mb-2 relative z-10">
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 line-clamp-1">{label}</span>
                        <span className="text-[9px] opacity-60 font-medium">Trước {deadline}</span>
                    </div>
                </div>

                <div className="flex-1 flex flex-col justify-end relative z-10">
                    <span className="text-xl font-black tracking-tight leading-none mb-1">{mainTimeDisplay}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-90">{statusText}</span>
                </div>
            </div>
        );
    };

    // Helper to get event status badge
    const getEventStatusBadge = (status: string) => {
        switch (status) {
            case 'ongoing':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                        <Play size={10} /> Đang diễn ra
                    </span>
                );
            case 'upcoming':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                        <Clock size={10} /> Sắp diễn ra
                    </span>
                );
            case 'ended':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                        <Pause size={10} /> Đã kết thúc
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-5 pb-6 animate-in fade-in duration-500 relative min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">

            {/* Colorful Header with Gradient */}
            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 rounded-b-3xl px-4 py-5 -mx-4 -mt-4 shadow-lg shadow-blue-200/50">
                <div className="flex justify-between items-center">
                    <div className="text-white">
                        <h1 className="text-xl font-bold drop-shadow-sm">Xin chào, {user.full_name.split(' ').pop()}!</h1>
                        <p className="text-xs opacity-80">Chúc bạn một ngày tốt lành 🌟</p>
                    </div>
                    <div className="relative">
                        <button
                            onClick={handleOpenNotif}
                            className="p-2.5 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors relative border border-white/30"
                        >
                            <Bell size={20} className={unreadCount > 0 ? "text-yellow-300" : "text-white"} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-indigo-600 animate-pulse">
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notification Dropdown */}
                        {showNotif && (
                            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-3 flex justify-between items-center">
                                    <span className="font-bold text-white text-sm">Thông báo</span>
                                    <span className="text-xs text-white/80 cursor-pointer hover:text-white" onClick={() => setShowNotif(false)}>Đóng</span>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 text-sm">Không có thông báo mới</div>
                                    ) : (
                                        notifications.map(n => (
                                            <div
                                                key={n.id}
                                                className={`p-3 border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                                                onClick={() => {
                                                    if (n.type === 'points') onNavigate('ranking');
                                                    else if (n.type === 'approved' || n.type === 'rejected') onNavigate('requests');
                                                    setShowNotif(false);
                                                }}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="text-[13px] text-gray-900 font-bold">{n.title || 'Thông báo'}</p>
                                                    {!n.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
                                                </div>
                                                <p className="text-xs text-gray-600 line-clamp-2">{n.message}</p>
                                                <span className="text-[10px] text-gray-400 mt-1.5 block">{new Date(n.time).toLocaleString('vi-VN')}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Stats Row */}
                <div className="mt-4 flex gap-3">
                    <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                        <p className="text-white/70 text-[10px] font-medium">Điểm hiện tại</p>
                        <p className="text-white text-lg font-black">{currentPoints} <span className="text-xs font-normal">điểm</span></p>
                    </div>
                    <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                        <p className="text-white/70 text-[10px] font-medium">Mã học sinh</p>
                        <p className="text-white text-lg font-black">{user.student_code || '---'}</p>
                    </div>
                    <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                        <p className="text-white/70 text-[10px] font-medium">Lớp</p>
                        <p className="text-white text-lg font-black">{user.organization || '---'}</p>
                    </div>
                </div>
            </div>

            {/* Point Stats Summary Widget */}
            <div className="mx-1">
                <PointStatsWidget stats={pointStats} />
            </div>

            {/* Today's Check-in Status */}
            <div className="bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/30 rounded-2xl p-5 shadow-sm border border-blue-100/50 mx-1">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5 rounded-lg text-white shadow-sm">
                            <Calendar size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">Điểm danh hôm nay</h3>
                            <p className="text-[10px] text-gray-500">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                        </div>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-xs font-bold ${todayRecord?.exit_permission ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {todayRecord?.exit_permission ? 'Có phép' : 'Xem thời gian'}
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                    {timeSlots.map(slot => {
                        const slotData = todayRecord?.slots?.[slot.id];
                        const timeIn = slotData?.time;

                        return (
                            <TimeSlot
                                key={slot.id}
                                label={slot.name.replace('Điểm danh ', '')}
                                timeIn={timeIn}
                                deadline={slot.end_time}
                                startTimeStr={slot.start_time}
                            />
                        );
                    })}
                    {timeSlots.length === 0 && (
                        <p className="col-span-full text-center py-4 text-slate-400 text-xs italic">
                            Chưa có khung giờ nào được thiết lập
                        </p>
                    )}
                </div>
            </div>

            {/* Quick Actions Section */}
            <div className="mx-1 bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 rounded-2xl p-4 border border-purple-100/50">
                <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wider opacity-70">Tiện ích</h3>
                <div className="grid grid-cols-4 gap-2">
                    <QuickAction icon={<QrCode size={20} />} label="Mã Thẻ" target="card" color="bg-gradient-to-br from-indigo-500 to-purple-600" />
                    <QuickAction icon={<FileText size={20} />} label="Xin phép" target="requests" color="bg-gradient-to-br from-orange-400 to-rose-500" />
                    <QuickAction icon={<BarChart2 size={20} />} label="Xếp hạng" target="ranking" color="bg-gradient-to-br from-teal-400 to-cyan-500" />
                    <QuickAction icon={<Award size={20} />} label="Thành tích" target="certificates" color="bg-gradient-to-br from-pink-400 to-rose-500" />
                </div>
            </div>

            {/* My Events Section - Only show if student has events */}
            {myEvents.length > 0 && (
                <div className="mx-1 bg-gradient-to-br from-amber-50/50 via-orange-50/30 to-rose-50/20 rounded-2xl p-4 border border-orange-100/50">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg text-white shadow-sm">
                            <Megaphone size={14} />
                        </div>
                        <h3 className="font-bold text-gray-800 text-sm">Sự kiện của bạn</h3>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {myEvents.map(event => (
                            <div
                                key={event.id}
                                className={`min-w-[280px] rounded-xl border p-4 flex flex-col relative overflow-hidden group transition-all ${event.eventStatus === 'ongoing'
                                    ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-md shadow-green-100'
                                    : event.eventStatus === 'upcoming'
                                        ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200 shadow-sm'
                                        : 'bg-gray-50 border-gray-200 opacity-80'
                                    }`}
                            >
                                {/* Status Badge */}
                                <div className="mb-2">
                                    {getEventStatusBadge(event.eventStatus)}
                                </div>

                                {/* Event Name */}
                                <h4 className="font-bold text-gray-800 line-clamp-1 text-sm">{event.name}</h4>

                                {/* Time */}
                                <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5">
                                    <Calendar size={12} className="text-gray-400" />
                                    <span>
                                        {new Date(event.start_time).toLocaleDateString('vi-VN')} • {new Date(event.start_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(event.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Location */}
                                {event.location && (
                                    <div className="text-xs text-gray-600 mt-1 flex items-center gap-1.5">
                                        <MapPin size={12} className="text-gray-400" />
                                        <span className="line-clamp-1">{event.location}</span>
                                    </div>
                                )}

                                {/* Points */}
                                <div className="mt-3 flex justify-between items-center">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${event.eventStatus === 'ended' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                        +{event.points_on_time} điểm
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const PointStatsWidget = ({ stats }: { stats: any }) => {
    if (!stats) return null;
    const balance = stats.totalAdded - stats.totalDeducted;
    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${balance >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {balance >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
            </div>
            <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biến động tuần này</p>
                <div className="flex items-center gap-2">
                    <span className={`text-xl font-black ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {balance > 0 ? '+' : ''}{balance}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">điểm</span>
                </div>
            </div>
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <ArrowRight size={10} className="-rotate-45" /> +{stats.totalAdded}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
                    <ArrowRight size={10} className="rotate-45" /> -{stats.totalDeducted}
                </div>
            </div>
        </div>
    );
};


import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { Event, EventStatus, EventType, User } from '../../types';

interface EventListProps {
    onSelectEvent: (event: Event) => void;
    onCreateEvent: () => void;
    onEditEvent?: (event: Event) => void;
}

// SVG Icons
const Icons = {
    plus: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
    ),
    calendar: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
    ),
    book: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
    ),
    target: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
    ),
    home: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
    ),
    academic: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
    ),
    location: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
    ),
    clock: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    edit: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
    ),
    trash: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
    ),
    users: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
    ),
    info: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
    ),
    close: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    ),
    lightbulb: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
    ),
    check: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    copy: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
        </svg>
    ),
};

const EventList: React.FC<EventListProps> = ({ onSelectEvent, onCreateEvent, onEditEvent }) => {
    const [events, setEvents] = useState<Event[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | EventStatus>('all');
    const [showTips, setShowTips] = useState(true);
    const [showParticipantModal, setShowParticipantModal] = useState(false);
    const [selectedEventForParticipants, setSelectedEventForParticipants] = useState<Event | null>(null);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<Event | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        loadEvents();
        loadUsers();
    }, []);

    // Calculate event status based on current time
    const getEventStatus = (event: Event): EventStatus => {
        const now = new Date();
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);

        if (now < start) return 'draft'; // Upcoming - shown as "Sắp diễn ra"
        if (now >= start && now <= end) return 'active'; // Happening now
        return 'completed'; // Past
    };

    const loadEvents = async () => {
        setIsLoading(true);
        try {
            const result = await dataService.getEvents();
            if (result.success && result.data) {
                // Update event status based on time
                const updatedEvents = result.data.map(event => ({
                    ...event,
                    status: getEventStatus(event)
                }));
                setEvents(updatedEvents);

                // Load participant counts for each event
                loadParticipantCounts(updatedEvents);
            }
        } catch (error) { console.error('Failed to load events:', error); }
        finally { setIsLoading(false); }
    };

    const loadParticipantCounts = async (eventList: Event[]) => {
        try {
            // Load participant counts in PARALLEL (much faster!)
            const countPromises = eventList.map(async (event) => {
                const result = await dataService.getEventParticipantCount(event.id);
                return {
                    eventId: event.id,
                    count: result.success && result.data !== undefined ? result.data : 0
                };
            });

            const results = await Promise.all(countPromises);
            const counts: Record<string, number> = {};
            results.forEach(r => {
                counts[r.eventId] = r.count;
            });
            setParticipantCounts(counts);
        } catch (error) { console.error('Failed to load participant counts:', error); }
    };

    const loadUsers = async () => {
        try {
            const result = await dataService.getUsers();
            if (result.success && result.data) setAllUsers(result.data);
        } catch (error) { console.error('Failed to load users:', error); }
    };

    const handleDeleteEvent = async (event: Event) => {
        setDeletingId(event.id);
        try {
            const result = await dataService.deleteEvent(event.id);
            if (result.success) {
                setEvents(prev => prev.filter(e => e.id !== event.id));
                setConfirmDelete(null);
                setNotification({ type: 'success', message: `Đã xóa sự kiện "${event.name}" thành công!` });
                setTimeout(() => setNotification(null), 3000);
            } else {
                setNotification({ type: 'error', message: result.error || 'Không thể xóa sự kiện' });
                setTimeout(() => setNotification(null), 3000);
            }
        } catch (error) {
            console.error('Failed to delete event:', error);
            setNotification({ type: 'error', message: 'Lỗi kết nối khi xóa sự kiện' });
            setTimeout(() => setNotification(null), 3000);
        } finally {
            setDeletingId(null);
        }
    };

    const handleDuplicateEvent = async (event: Event) => {
        try {
            const newEvent = {
                name: `${event.name} (Bản sao)`,
                type: event.type,
                start_time: event.start_time,
                end_time: event.end_time,
                location: event.location,
                target_audience: event.target_audience,
                late_threshold_mins: event.late_threshold_mins,
                points_on_time: event.points_on_time,
                points_late: event.points_late,
                points_absent: event.points_absent,
                require_face: event.require_face,
                face_threshold: event.face_threshold,
            };
            const result = await dataService.createEvent(newEvent);
            if (result.success) {
                loadEvents();
            }
        } catch (error) { console.error('Failed to duplicate event:', error); }
    };

    const openParticipantModal = async (event: Event) => {
        setSelectedEventForParticipants(event);
        // Load participants from event_participants table
        try {
            const result = await dataService.getEventParticipants(event.id);
            if (result.success && result.data) {
                setSelectedParticipants(result.data.map(p => p.id));
            } else {
                setSelectedParticipants([]);
            }
        } catch (error) {
            console.error('Failed to load participants:', error);
            setSelectedParticipants([]);
        }
        setShowParticipantModal(true);
    };

    const saveParticipants = async () => {
        if (!selectedEventForParticipants) return;
        try {
            // Note: This is for adding existing users as participants
            // For now just close modal - actual participant management is in EventForm
            loadEvents();
            setShowParticipantModal(false);
        } catch (error) { console.error('Failed to save participants:', error); }
    };

    const toggleParticipant = (userId: string) => {
        setSelectedParticipants(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const selectAllByRole = (role: string) => {
        const userIds = allUsers.filter(u => u.role === role).map(u => u.id);
        setSelectedParticipants(prev => {
            const newSet = new Set([...prev, ...userIds]);
            return Array.from(newSet);
        });
    };

    const selectAllByClass = (classId: string) => {
        const userIds = allUsers.filter(u => u.class_id === classId).map(u => u.id);
        setSelectedParticipants(prev => {
            const newSet = new Set([...prev, ...userIds]);
            return Array.from(newSet);
        });
    };

    const filteredEvents = events.filter(event => filter === 'all' || event.status === filter);

    const filteredUsers = allUsers.filter(user =>
        user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.class_id && user.class_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const uniqueClasses = [...new Set(allUsers.filter(u => u.class_id).map(u => u.class_id))];

    const getStatusBadge = (status: EventStatus) => {
        const styles: Record<EventStatus, string> = {
            'draft': 'bg-amber-100 text-amber-600',
            'active': 'bg-emerald-50 text-emerald-600',
            'completed': 'bg-indigo-50 text-indigo-600'
        };
        const labels: Record<EventStatus, string> = {
            'draft': 'Sắp diễn ra',
            'active': 'Đang diễn ra',
            'completed': 'Đã kết thúc'
        };
        return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${styles[status]}`}>{labels[status]}</span>;
    };

    const getTypeIcon = (type: EventType) => {
        const icons: Record<EventType, React.ReactNode> = {
            'học_tập': Icons.book,
            'ngoại_khóa': Icons.target,
            'nội_trú': Icons.home,
            'tập_huấn': Icons.academic
        };
        return icons[type] || Icons.calendar;
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-64"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    return (
        <div className="space-y-6">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-2xl shadow-lg flex items-center gap-3 animate-fade-in ${notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                    {notification.type === 'success' ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                    )}
                    <span className="font-bold">{notification.message}</span>
                    <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
                        {Icons.close}
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        Quản lý sự kiện
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Tạo và quản lý các hoạt động check-in</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowTips(!showTips)}
                        className={`p-3 rounded-xl flex items-center gap-2 transition-all ${showTips ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        title="Hiển thị gợi ý"
                    >
                        {Icons.lightbulb}
                    </button>
                    <button onClick={onCreateEvent} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg hover:bg-indigo-700">
                        {Icons.plus} TẠO SỰ KIỆN MỚI
                    </button>
                </div>
            </div>

            {/* Tips Panel */}
            {showTips && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-6 border border-amber-200">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 flex-shrink-0">
                            {Icons.lightbulb}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-black text-amber-900 text-lg mb-3">Hướng dẫn sử dụng hệ thống cho nhà trường</h3>
                                <button onClick={() => setShowTips(false)} className="text-amber-400 hover:text-amber-600">
                                    {Icons.close}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                <div className="bg-white/60 rounded-xl p-4">
                                    <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                                        Họp phụ huynh
                                    </h4>
                                    <ul className="text-amber-700 space-y-1">
                                        <li>• Chọn loại: <strong>Ngoại khóa</strong></li>
                                        <li>• Thêm danh sách phụ huynh từng lớp</li>
                                        <li>• Bật xác nhận khuôn mặt (khuyến nghị)</li>
                                        <li>• Thiết lập điểm đúng giờ/muộn</li>
                                    </ul>
                                </div>

                                <div className="bg-white/60 rounded-xl p-4">
                                    <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>
                                        Tập huấn giáo viên
                                    </h4>
                                    <ul className="text-amber-700 space-y-1">
                                        <li>• Chọn loại: <strong>Tập huấn</strong></li>
                                        <li>• Thêm tất cả giáo viên vào danh sách</li>
                                        <li>• Theo dõi điểm chuyên cần</li>
                                        <li>• Xuất báo cáo sau sự kiện</li>
                                    </ul>
                                </div>

                                <div className="bg-white/60 rounded-xl p-4">
                                    <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                                        Điểm danh học tập
                                    </h4>
                                    <ul className="text-amber-700 space-y-1">
                                        <li>• Chọn loại: <strong>Học tập</strong></li>
                                        <li>• Chọn lớp cần điểm danh</li>
                                        <li>• Thiết lập thời gian đi muộn 5-10 phút</li>
                                        <li>• Cài đúng giờ +10đ, muộn -5đ</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-4 p-4 bg-white/60 rounded-xl">
                                <h4 className="font-bold text-amber-800 mb-2">Quy trình tạo sự kiện hiệu quả:</h4>
                                <div className="flex items-center gap-3 text-amber-700 text-sm flex-wrap">
                                    <span className="flex items-center gap-1"><span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-800">1</span> Tạo sự kiện</span>
                                    <span>→</span>
                                    <span className="flex items-center gap-1"><span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-800">2</span> Thêm người tham gia</span>
                                    <span>→</span>
                                    <span className="flex items-center gap-1"><span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-800">3</span> Kích hoạt (Active)</span>
                                    <span>→</span>
                                    <span className="flex items-center gap-1"><span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-800">4</span> Check-in</span>
                                    <span>→</span>
                                    <span className="flex items-center gap-1"><span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-800">5</span> Xem báo cáo</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-fit">
                {(['all', 'active', 'draft', 'completed'] as const).map(status => (
                    <button key={status} onClick={() => setFilter(status)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${filter === status ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {status === 'all' ? 'Tất cả' : status === 'active' ? 'Đang diễn ra' : status === 'draft' ? 'Nháp' : 'Đã kết thúc'}
                    </button>
                ))}
            </div>

            {/* Events Grid */}
            {filteredEvents.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                        {Icons.calendar}
                    </div>
                    <p className="text-slate-800 font-bold text-lg mb-2">Chưa có sự kiện nào</p>
                    <p className="text-slate-500 text-sm mb-4">Tạo sự kiện mới để bắt đầu quản lý check-in</p>
                    <button onClick={onCreateEvent} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 inline-flex items-center gap-2">
                        {Icons.plus} Tạo sự kiện đầu tiên
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEvents.map(event => (
                        <div key={event.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
                            {/* Event Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">{getTypeIcon(event.type)}</div>
                                <div className="flex items-center gap-2">
                                    {getStatusBadge(event.status)}
                                </div>
                            </div>

                            {/* Event Name - Clickable */}
                            <h3
                                onClick={() => onSelectEvent(event)}
                                className="text-lg font-black text-slate-900 mb-2 line-clamp-2 group-hover:text-indigo-600 cursor-pointer"
                            >
                                {event.name}
                            </h3>

                            {/* Event Info */}
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-slate-500">
                                    <span className="text-indigo-400">{Icons.location}</span>
                                    <span className="font-medium">{event.location || 'Chưa xác định'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-500">
                                    <span className="text-indigo-400">{Icons.clock}</span>
                                    <span className="font-medium">{new Date(event.start_time).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-500">
                                    <span className="text-indigo-400">{Icons.users}</span>
                                    <span className="font-medium">{participantCounts[event.id] || 0} người tham gia</span>
                                </div>
                            </div>

                            {/* Event Actions */}
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                                {/* Left: Face requirement */}
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${event.require_face ? 'bg-indigo-500' : 'bg-slate-300'}`}></span>
                                    <span className="text-xs font-medium text-slate-400">{event.require_face ? 'Face ID' : 'QR'}</span>
                                </div>

                                {/* Right: Action Buttons */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openParticipantModal(event)}
                                        className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors"
                                        title="Quản lý người tham gia"
                                    >
                                        {Icons.users}
                                    </button>
                                    <button
                                        onClick={() => handleDuplicateEvent(event)}
                                        className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                        title="Sao chép sự kiện"
                                    >
                                        {Icons.copy}
                                    </button>
                                    <button
                                        onClick={() => onEditEvent?.(event)}
                                        className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                                        title="Chỉnh sửa"
                                    >
                                        {Icons.edit}
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(event)}
                                        className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                        title="Xóa"
                                    >
                                        {Icons.trash}
                                    </button>
                                </div>
                            </div>

                            {/* Check-in Button */}
                            <button
                                onClick={() => {
                                    const checkinUrl = `${window.location.origin}/checkin/${event.id}`;
                                    window.open(checkinUrl, '_blank', 'noopener,noreferrer');
                                }}
                                className="w-full mt-3 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Mở Check-in
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full text-center">
                        <div className={`w-16 h-16 ${deletingId ? 'bg-slate-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                            {deletingId ? (
                                <div className="w-8 h-8 border-3 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                            )}
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-2">
                            {deletingId ? 'Đang xóa...' : 'Xác nhận xóa'}
                        </h3>
                        <p className="text-slate-500 mb-6">
                            {deletingId
                                ? `Đang xóa sự kiện "${confirmDelete.name}", vui lòng chờ...`
                                : <>Bạn có chắc muốn xóa sự kiện "<strong>{confirmDelete.name}</strong>"? Hành động này không thể hoàn tác.</>
                            }
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                disabled={!!deletingId}
                                className={`flex-1 py-3 rounded-xl font-bold ${deletingId ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            >
                                Hủy
                            </button>
                            <button
                                onClick={() => handleDeleteEvent(confirmDelete)}
                                disabled={!!deletingId}
                                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${deletingId ? 'bg-red-300 text-red-100 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                            >
                                {deletingId && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                {deletingId ? 'Đang xóa' : 'Xóa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Participant Management Modal */}
            {showParticipantModal && selectedEventForParticipants && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <span className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">{Icons.users}</span>
                                Quản lý người tham gia
                            </h3>
                            <button onClick={() => setShowParticipantModal(false)} className="text-slate-400 hover:text-slate-600">
                                {Icons.close}
                            </button>
                        </div>

                        {/* Event Info */}
                        <div className="bg-slate-50 rounded-xl p-4 mb-4">
                            <p className="font-bold text-slate-900">{selectedEventForParticipants.name}</p>
                            <p className="text-sm text-slate-500">{new Date(selectedEventForParticipants.start_time).toLocaleString('vi-VN')}</p>
                        </div>

                        {/* Quick Selection */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="text-sm font-bold text-slate-600">Chọn nhanh:</span>
                            <button
                                onClick={() => selectAllByRole('student')}
                                className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-bold hover:bg-blue-200"
                            >
                                Tất cả học sinh
                            </button>
                            <button
                                onClick={() => selectAllByRole('teacher')}
                                className="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-xs font-bold hover:bg-purple-200"
                            >
                                Tất cả giáo viên
                            </button>
                            {uniqueClasses.slice(0, 5).map(classId => (
                                <button
                                    key={String(classId)}
                                    onClick={() => selectAllByClass(String(classId))}
                                    className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-bold hover:bg-emerald-200"
                                >
                                    Lớp {classId}
                                </button>
                            ))}
                            <button
                                onClick={() => setSelectedParticipants([])}
                                className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold hover:bg-slate-200"
                            >
                                Bỏ chọn tất cả
                            </button>
                        </div>

                        {/* Search */}
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo tên hoặc lớp..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-4"
                        />

                        {/* Selected count */}
                        <div className="mb-3 text-sm text-slate-600">
                            Đã chọn: <strong className="text-indigo-600">{selectedParticipants.length}</strong> người
                        </div>

                        {/* User List */}
                        <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px]">
                            {filteredUsers.map(user => (
                                <div
                                    key={user.id}
                                    onClick={() => toggleParticipant(user.id)}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedParticipants.includes(user.id)
                                        ? 'bg-indigo-50 border-2 border-indigo-300'
                                        : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                                        }`}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${selectedParticipants.includes(user.id) ? 'bg-indigo-600 text-white' : 'bg-white border-2 border-slate-300'
                                        }`}>
                                        {selectedParticipants.includes(user.id) && Icons.check}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-900">{user.full_name}</p>
                                        <p className="text-xs text-slate-500">{user.class_id || user.role}</p>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.role === 'student' ? 'bg-blue-100 text-blue-600' :
                                        user.role === 'teacher' ? 'bg-purple-100 text-purple-600' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                        {user.role === 'student' ? 'Học sinh' : user.role === 'teacher' ? 'Giáo viên' : user.role}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={saveParticipants}
                            className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 flex items-center justify-center gap-2"
                        >
                            {Icons.check} LƯU DANH SÁCH ({selectedParticipants.length} người)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EventList;

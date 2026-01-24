import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { useToast } from './Toast';

type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'points' | 'event' | 'certificate' | 'permission';

interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
    data?: any;
}

interface NotificationListProps {
    userId: string;
    className?: string;
    iconClassName?: string;
}

export const NotificationList: React.FC<NotificationListProps> = ({ userId, className, iconClassName }) => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { success, error } = useToast();

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchNotifications = async () => {
        if (!userId) return;
        const { data, error: err } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (data) {
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.is_read).length);
        }
    };

    useEffect(() => {
        fetchNotifications();

        // Subscribe to changes
        const channel = supabase
            .channel(`public:notifications:user_id=eq.${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setNotifications(prev => [payload.new as NotificationItem, ...prev]);
                    setUnreadCount(prev => prev + 1);
                    // Optional: Brief toast or sound
                } else if (payload.eventType === 'UPDATE') {
                    setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new as NotificationItem : n));
                    // Re-calc unread (could be optimized)
                    setUnreadCount(prev => {
                        // If marking as read, decrease
                        if (payload.old.is_read === false && payload.new.is_read === true) return Math.max(0, prev - 1);
                        return prev;
                    });
                }
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [userId]);

    const handleMarkAllRead = async () => {
        try {
            const { error: err } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            if (!err) {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                setUnreadCount(0);
                success('Đã đánh dấu tất cả là đã đọc');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkRead = async (id: string) => {
        const { error: err } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (!err) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const getIcon = (type: NotificationType) => {
        switch (type) {
            case 'success': return <div className="w-2 h-2 rounded-full bg-green-500" />;
            case 'error': return <div className="w-2 h-2 rounded-full bg-red-500" />;
            case 'warning': return <div className="w-2 h-2 rounded-full bg-yellow-500" />;
            case 'points': return <div className="w-2 h-2 rounded-full bg-amber-500" />;
            case 'event': return <div className="w-2 h-2 rounded-full bg-indigo-500" />;
            case 'certificate': return <div className="w-2 h-2 rounded-full bg-teal-500" />;
            case 'permission': return <div className="w-2 h-2 rounded-full bg-blue-500" />;
            default: return <div className="w-2 h-2 rounded-full bg-gray-400" />;
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-full transition-colors ${className || 'hover:bg-gray-100'}`}
            >
                <Bell size={24} className={iconClassName || "text-gray-600"} />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-gray-800">Thông báo</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllRead}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                            >
                                <Check size={14} /> Đánh dấu đã đọc
                            </button>
                        )}
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                Không có thông báo nào
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {notifications.map(n => (
                                    <div
                                        key={n.id}
                                        className={`p-4 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-indigo-50/30' : ''}`}
                                        onClick={() => !n.is_read && handleMarkRead(n.id)}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-1.5 flex-shrink-0">
                                                {getIcon(n.type)}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className={`text-sm ${!n.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                                    {n.title}
                                                </h4>
                                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                                                <p className="text-[10px] text-gray-400 mt-2">
                                                    {new Date(n.created_at).toLocaleString('vi-VN')}
                                                </p>
                                            </div>
                                            {!n.is_read && (
                                                <div className="flex-shrink-0 self-center">
                                                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

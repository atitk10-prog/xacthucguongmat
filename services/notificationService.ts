/**
 * Notification Service - Web Push & In-App Notifications
 * Handles push notification registration and sending
 */

// Check if browser supports notifications
export const isNotificationSupported = () => {
    return 'Notification' in window && 'serviceWorker' in navigator;
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (!isNotificationSupported()) {
        console.warn('Notifications not supported in this browser');
        return 'denied';
    }

    const permission = await Notification.requestPermission();
    return permission;
};

// Get current permission status
export const getNotificationPermission = (): NotificationPermission => {
    if (!isNotificationSupported()) return 'denied';
    return Notification.permission;
};

// Show a browser notification (works when app is in foreground)
export const showNotification = (title: string, options?: NotificationOptions) => {
    if (!isNotificationSupported() || Notification.permission !== 'granted') {
        console.warn('Cannot show notification: permission not granted');
        return;
    }

    // Create notification
    const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
    });

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    return notification;
};

// In-app notification queue (for UI components to consume)
type InAppNotification = {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning' | 'points';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    data?: any;
};

const notificationQueue: InAppNotification[] = [];
const listeners: Set<(notifications: InAppNotification[]) => void> = new Set();

// Add notification to queue
export const addInAppNotification = (notification: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: InAppNotification = {
        ...notification,
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        read: false
    };

    notificationQueue.unshift(newNotification);

    // Keep only last 50 notifications
    if (notificationQueue.length > 50) {
        notificationQueue.pop();
    }

    // Notify listeners
    listeners.forEach(listener => listener([...notificationQueue]));

    // Also show browser notification if permission granted
    if (Notification.permission === 'granted') {
        showNotification(notification.title, {
            body: notification.message,
            tag: newNotification.id
        });
    }

    return newNotification;
};

// Subscribe to notification updates
export const subscribeToNotifications = (callback: (notifications: InAppNotification[]) => void) => {
    listeners.add(callback);
    callback([...notificationQueue]); // Send current state immediately
    return () => listeners.delete(callback);
};

// Mark notification as read
export const markAsRead = (notificationId: string) => {
    const notification = notificationQueue.find(n => n.id === notificationId);
    if (notification) {
        notification.read = true;
        listeners.forEach(listener => listener([...notificationQueue]));
    }
};

// Mark all as read
export const markAllAsRead = () => {
    notificationQueue.forEach(n => n.read = true);
    listeners.forEach(listener => listener([...notificationQueue]));
};

// Get unread count
export const getUnreadCount = () => {
    return notificationQueue.filter(n => !n.read).length;
};

// Helper to notify about points change
export const notifyPointsChange = (
    studentName: string,
    points: number,
    reason: string
) => {
    const isPositive = points > 0;
    addInAppNotification({
        type: 'points',
        title: isPositive ? '🎉 Điểm thưởng' : '⚠️ Điểm trừ',
        message: `${studentName}: ${isPositive ? '+' : ''}${points} điểm - ${reason}`,
        data: { points, reason }
    });
};

// Export for use in other modules
export const notificationService = {
    isSupported: isNotificationSupported,
    requestPermission: requestNotificationPermission,
    getPermission: getNotificationPermission,
    show: showNotification,
    addNotification: addInAppNotification,
    subscribe: subscribeToNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    notifyPointsChange
};

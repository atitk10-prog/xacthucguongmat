// Service Worker for Push Notifications
// This file runs in the background and handles notifications even when the app is closed

const CACHE_NAME = 'educheck-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[SW] Service worker activated');
    event.waitUntil(clients.claim());
});

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'EduCheck Thông báo',
        body: 'Có thông báo mới từ hệ thống',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'educheck-notification',
        data: {}
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: data.tag,
        vibrate: [100, 50, 100],
        data: data.data,
        actions: [
            { action: 'open', title: 'Xem chi tiết' },
            { action: 'close', title: 'Đóng' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Open the app when notification is clicked
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If app is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes(self.registration.scope) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open new window
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// Background sync (for offline support)
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    // Handle background sync if needed
});

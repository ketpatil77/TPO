'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
    const fallback = { title: 'AIT Placement Portal', body: 'Your placement profile needs attention.', data: { url: '/dashboard?tab=edit-profile' } };
    let message = fallback;
    try { message = { ...fallback, ...event.data.json() }; } catch (_) { /* use safe fallback */ }
    event.waitUntil(self.registration.showNotification(message.title, {
        body: message.body,
        icon: message.icon || '/icons/icon-192.png',
        badge: message.badge || '/icons/icon-192.png',
        tag: message.tag || 'profile-completion-reminder',
        renotify: true,
        data: message.data || fallback.data
    }));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || '/dashboard?tab=edit-profile', self.location.origin).href;
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
        const existing = windows.find(windowClient => windowClient.url.startsWith(self.location.origin));
        return existing ? existing.navigate(target).then(client => client.focus()) : clients.openWindow(target);
    }));
});

'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function notificationTag(message) {
    const url = String(message?.data?.url || '');
    if (message?.tag === 'profile-completion-reminder' || url.includes('edit-profile')) return 'ait-profile-updates';
    if (url.includes('opportunities') || url.includes('jobs')) return 'ait-placement-updates';
    return 'ait-portal-updates';
}

async function showPortalNotification(message, fallback) {
    const tag = notificationTag(message);
    const title = String(message.title || fallback.title);
    const body = String(message.body || fallback.body);

    // Do not surface the same push twice. In-app notifications remain the full history.
    const visible = await self.registration.getNotifications({ tag });
    const duplicate = visible.some(item => item.title === title && item.body === body);
    if (duplicate) return;

    return self.registration.showNotification(title, {
        body,
        icon: message.icon || '/icons/icon-192.png',
        badge: message.badge || '/icons/icon-192.png',
        tag,
        renotify: false,
        requireInteraction: false,
        timestamp: Date.now(),
        data: { ...(message.data || fallback.data), pushCategory: tag }
    });
}

async function notifyOpenPortalClients(message) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
        if (!client.url.startsWith(self.location.origin)) continue;
        client.postMessage({
            type: 'AIT_PUSH_RECEIVED',
            notificationId: message?.data?.notificationId || null,
            url: message?.data?.url || '/dashboard?tab=opportunities'
        });
    }
}

self.addEventListener('push', event => {
    const fallback = { title: 'AIT Placement Portal', body: 'You have a new placement update.', data: { url: '/dashboard?tab=opportunities' } };
    let message = fallback;
    try { message = { ...fallback, ...event.data.json() }; } catch (_) { /* use safe fallback */ }
    event.waitUntil(Promise.all([
        showPortalNotification(message, fallback),
        notifyOpenPortalClients(message)
    ]));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || '/dashboard?tab=opportunities', self.location.origin).href;
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
        const existing = windows.find(windowClient => windowClient.url.startsWith(self.location.origin));
        return existing ? existing.navigate(target).then(client => client.focus()) : clients.openWindow(target);
    }));
});

/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

/** Caches contenant des données de l'utilisateur : vidés à la déconnexion (message `clear-user-cache`). */
const USER_CACHES = ['api-history'];

// ── Cache de l'app ──────────────────────────────────────────────

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

// Shell de l'app (SPA) : réseau d'abord, dernière version en cache hors ligne.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 3 }),
);

// ── Historique hors ligne ───────────────────────────────────────

const OFFLINE_API_PATHS = [
  /^\/api\/me$/,
  /^\/api\/conversations(\/[\w-]+)?$/,
  /^\/api\/files$/,
  /^\/api\/actions(\/[\w-]+)?$/,
];

registerRoute(
  ({ url, request }) => request.method === 'GET'
    && url.origin === self.location.origin
    && OFFLINE_API_PATHS.some((pattern) => pattern.test(url.pathname)),
  new NetworkFirst({
    cacheName: 'api-history',
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-user-cache') {
    event.waitUntil(Promise.all(USER_CACHES.map((name) => caches.delete(name))));
  }
});

// ── Notifications push ──────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  action?: { id: string; token: string };
}

interface NotificationData {
  url: string;
  action?: { id: string; token: string };
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json() as PushPayload;
  const data: NotificationData = { url: payload.url, action: payload.action };

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data,
    requireInteraction: Boolean(payload.action),
    // Ignorés sur iOS : le clic sur le corps ouvre alors la carte de confirmation dans l'app.
    actions: payload.action
      ? [{ action: 'approve', title: 'Valider' }, { action: 'reject', title: 'Refuser' }]
      : [],
  } as NotificationOptions));
});

async function openOrFocus(url: string): Promise<void> {
  const target = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (existing) {
    await existing.focus();
    await existing.navigate(target);
    return;
  }
  await self.clients.openWindow(target);
}

async function sendDecision(action: { id: string; token: string }, decision: 'approve' | 'reject'): Promise<void> {
  try {
    const response = await fetch(`/api/actions/${action.id}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ decision, token: action.token }),
    });
    const body = await response.json().catch(() => null) as { message?: string; action?: { status: string; error?: string | null } } | null;

    if (!response.ok) {
      await self.registration.showNotification('Action non traitée', {
        body: body?.message ?? "La décision n'a pas pu être enregistrée.",
        data: { url: `/actions/${action.id}` } satisfies NotificationData,
      });
      return;
    }
    const status = body?.action?.status;
    const messages: Record<string, string> = {
      executed: "C'est fait : l'action a été exécutée.",
      rejected: 'Action refusée.',
      failed: body?.action?.error ?? "L'exécution a échoué.",
    };
    await self.registration.showNotification(status === 'failed' ? 'Échec de l’action' : 'Action traitée', {
      body: messages[status ?? ''] ?? 'Décision enregistrée.',
      data: { url: `/actions/${action.id}` } satisfies NotificationData,
    });
  } catch {
    // Hors ligne : on ouvre la carte pour que l'utilisateur décide depuis l'app.
    await openOrFocus(`/actions/${action.id}`);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as NotificationData | undefined;
  if (!data) return;

  if (data.action && (event.action === 'approve' || event.action === 'reject')) {
    event.waitUntil(sendDecision(data.action, event.action));
    return;
  }
  event.waitUntil(openOrFocus(data.url));
});

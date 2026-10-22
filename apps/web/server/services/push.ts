import { and, eq } from 'drizzle-orm';
import webpush, { WebPushError } from 'web-push';
import { z } from 'zod';
import { db, schema } from '../db';
import { getEnv } from '../utils/env';

const { pushSubscriptions } = schema;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Contenu d'une notification, interprété par le service worker. */
export interface PushPayload {
  title: string;
  body: string;
  /** Page ouverte au clic sur le corps de la notification. */
  url: string;
  tag?: string;
  /** Présent pour une demande de confirmation : boutons Valider / Refuser. */
  action?: { id: string; token: string };
  /** Présent pour un rappel : boutons Fait / +1 h. */
  reminder?: { id: string };
  /** Nombre affiché en pastille sur l'icône de l'app (actions à valider). */
  badge?: number;
}

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const env = getEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
}

export function getVapidPublicKey(): string {
  return getEnv().VAPID_PUBLIC_KEY;
}

export async function subscribe(userId: string, subscription: PushSubscriptionInput): Promise<void> {
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
}

export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Envoie une notification à tous les appareils de l'utilisateur. Les abonnements expirés sont supprimés. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: payload.reminder ? 60 * 60 : 15 * 60, urgency: payload.action || payload.reminder ? 'high' : 'normal' },
      );
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        return;
      }
      console.error('[push] envoi impossible', error instanceof Error ? error.message : error);
    }
  }));
}

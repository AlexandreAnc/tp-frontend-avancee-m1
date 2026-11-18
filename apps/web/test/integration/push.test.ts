import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { createUser, skipDb } from './helpers';

class FakeWebPushError extends Error {
  constructor(readonly statusCode: number) {
    super(`HTTP ${statusCode}`);
  }
}
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({
  default: { sendNotification: (...args: unknown[]) => sendNotification(...args), setVapidDetails: (...args: unknown[]) => setVapidDetails(...args) },
  WebPushError: FakeWebPushError,
}));

const push = await import('../../server/services/push');

let counter = 0;
const device = () => ({ endpoint: `https://push.example.com/${Date.now()}-${counter++}`, keys: { p256dh: 'p256dh', auth: 'auth' } });
const endpointsOf = async (userId: string) =>
  (await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId))).map((row) => row.endpoint);

describe.skipIf(skipDb)('notifications push', () => {
  it('expose la clé publique VAPID et valide un abonnement', () => {
    expect(push.getVapidPublicKey()).toBe('test');
    expect(push.pushSubscriptionSchema.safeParse(device()).success).toBe(true);
    expect(push.pushSubscriptionSchema.safeParse({ endpoint: 'pas une url', keys: { p256dh: 'a', auth: 'b' } }).success).toBe(false);
  });

  it("rattache un appareil au dernier compte connecté (un même navigateur, deux comptes)", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const shared = device();
    await push.subscribe(alice, shared);
    await push.subscribe(bob, shared);
    expect(await endpointsOf(alice)).toEqual([]);
    expect(await endpointsOf(bob)).toEqual([shared.endpoint]);
  });

  it("ne désabonne que ses propres appareils", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const phone = device();
    await push.subscribe(alice, phone);
    await push.unsubscribe(bob, phone.endpoint);
    expect(await endpointsOf(alice)).toEqual([phone.endpoint]);
    await push.unsubscribe(alice, phone.endpoint);
    expect(await endpointsOf(alice)).toEqual([]);
  });

  it("envoie à tous les appareils de l'utilisateur, en priorité haute pour une confirmation", async () => {
    sendNotification.mockReset().mockResolvedValue({});
    const userId = await createUser();
    const other = await createUser();
    await push.subscribe(userId, device());
    await push.subscribe(userId, device());
    await push.subscribe(other, device());

    const payload = { title: 'Action à valider', body: 'Payer', url: '/actions/1', action: { id: '1', token: 't' } };
    await push.sendToUser(userId, payload);
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:test@example.com', 'test', 'test');
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ keys: { p256dh: 'p256dh', auth: 'auth' } }), JSON.stringify(payload), { TTL: 900, urgency: 'high' });

    await push.sendToUser(userId, { title: 'Rappel', body: 'Pause', url: '/', reminder: { id: 'r' } });
    expect(sendNotification).toHaveBeenLastCalledWith(expect.anything(), expect.any(String), { TTL: 3600, urgency: 'high' });
    await push.sendToUser(userId, { title: 'Info', body: 'x', url: '/' });
    expect(sendNotification).toHaveBeenLastCalledWith(expect.anything(), expect.any(String), { TTL: 900, urgency: 'normal' });
  });

  it("supprime les abonnements expirés, garde ceux en panne passagère", async () => {
    const userId = await createUser();
    const expired = device();
    const flaky = device();
    await push.subscribe(userId, expired);
    await push.subscribe(userId, flaky);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendNotification.mockReset().mockImplementation(async (subscription: { endpoint: string }) => {
      throw new FakeWebPushError(subscription.endpoint === expired.endpoint ? 410 : 500);
    });

    await expect(push.sendToUser(userId, { title: 't', body: 'b', url: '/' })).resolves.toBeUndefined();
    expect(await endpointsOf(userId)).toEqual([flaky.endpoint]);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});

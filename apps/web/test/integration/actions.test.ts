import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import type * as Registry from '../../server/connectors/registry';
import type { PushPayload } from '../../server/services/push';
import { createUser, skipDb } from './helpers';

const sent: PushPayload[] = [];
vi.mock('../../server/services/push', () => ({
  sendToUser: vi.fn(async (_userId: string, payload: PushPayload) => void sent.push(payload)),
}));
const executeAction = vi.fn();
vi.mock('../../server/connectors/registry', async (importOriginal) => ({
  ...await importOriginal<typeof Registry>(),
  assertActionExecutable: vi.fn(async () => {}),
  executeAction: (...args: unknown[]) => executeAction(...args),
}));

const { requestAction, decideAction, expireActions } = await import('../../server/services/actions');

const action = {
  type: 'google_calendar.create_event' as const,
  payload: { title: 'Payer le plombier', start: '2026-11-14T09:00:00+01:00', end: '2026-11-14T10:00:00+01:00' },
};

async function propose(userId: string) {
  const created = await requestAction(userId, { action, summary: 'Ajouter un événement', conversationId: null, trigger: 'agent' });
  if (created.status !== 'pending') throw new Error('Un événement agenda doit être validé');
  const token = sent.at(-1)!.action!.token;
  return { ...created, token };
}

describe.skipIf(skipDb)('actions en attente', () => {
  it('envoie une notification avec un token à usage unique et une page de confirmation', async () => {
    const userId = await createUser();
    const { actionId } = await propose(userId);
    expect(sent.at(-1)).toMatchObject({ url: `/actions/${actionId}`, action: { id: actionId }, badge: 1 });
  });

  it("n'exécute l'action qu'une seule fois, même validée deux fois en même temps", async () => {
    executeAction.mockResolvedValue({ eventId: 'evt' });
    const userId = await createUser();
    const { actionId, token } = await propose(userId);

    const results = await Promise.allSettled([
      decideAction(actionId, { decision: 'approve', token }, null),
      decideAction(actionId, { decision: 'approve' }, { userId, sessionId: 'session-test' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'conflict' } });
    expect(executeAction).toHaveBeenCalledTimes(1);
  });

  it("refuse un token invalide ou la session d'un autre utilisateur", async () => {
    const userId = await createUser();
    const intruder = await createUser();
    const { actionId } = await propose(userId);
    await expect(decideAction(actionId, { decision: 'approve', token: 'faux' }, null)).rejects.toMatchObject({ code: 'not_found' });
    await expect(decideAction(actionId, { decision: 'approve' }, { userId: intruder, sessionId: 'session-intrus' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it("annule une action expirée sans jamais l'exécuter", async () => {
    executeAction.mockClear();
    const userId = await createUser();
    const { actionId, token } = await propose(userId);
    await db.update(schema.pendingActions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingActions.id, actionId));

    await expect(decideAction(actionId, { decision: 'approve', token }, null)).rejects.toMatchObject({ code: 'action_expired' });
    const [row] = await db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, actionId));
    expect(row?.status).toBe('expired');
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('expire en masse les actions dépassées', async () => {
    const userId = await createUser();
    const { actionId } = await propose(userId);
    await db.update(schema.pendingActions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingActions.id, actionId));
    await expireActions();
    const [row] = await db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, actionId));
    expect(row?.status).toBe('expired');
  });
});

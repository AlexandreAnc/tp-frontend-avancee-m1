import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import type * as Registry from '../../server/connectors/registry';
import type { PushPayload } from '../../server/services/push';
import { createUser, skipDb } from './helpers';

const sent: { userId: string; payload: PushPayload }[] = [];
vi.mock('../../server/services/push', () => ({
  sendToUser: vi.fn(async (userId: string, payload: PushPayload) => void sent.push({ userId, payload })),
}));
vi.mock('../../server/jobs/boss', () => ({ getBoss: async () => ({ send: async () => 'job' }) }));
vi.mock('../../server/services/tasks', () => ({ enqueueTask: vi.fn(async () => 'job'), cancelTasksFor: vi.fn() }));
const executeAction = vi.fn(async () => ({ ok: true }));
vi.mock('../../server/connectors/registry', async (importOriginal) => {
  const original = await importOriginal<typeof Registry>();
  return {
    ...original,
    // L'événement agenda est traité comme sensible pour tester la validation forte.
    riskOf: (type: Parameters<typeof original.riskOf>[0]) => (type === 'google_calendar.create_event' ? 'sensitive' : original.riskOf(type)),
    assertActionExecutable: vi.fn(async () => {}),
    executeAction: (...args: Parameters<typeof original.executeAction>) => (args[1].type === 'google_calendar.create_event' ? executeAction() : original.executeAction(...args)),
  };
});

const { requestAction, decideAction } = await import('../../server/services/actions');
const routines = await import('../../server/services/routines');
const tags = await import('../../server/services/tags');
const { listReminders } = await import('../../server/services/reminders');
const { updateSettings } = await import('../../server/services/settings');

async function sessionFor(userId: string) {
  const id = randomUUID();
  await db.insert(schema.session).values({ id, userId, token: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) });
  return id;
}

async function addPasskey(userId: string) {
  await db.insert(schema.passkey).values({
    id: randomUUID(), userId, publicKey: 'AAAA', credentialID: randomUUID(), counter: 0, deviceType: 'singleDevice', backedUp: false,
  });
}

const sensitiveAction = {
  type: 'google_calendar.create_event' as const,
  payload: { title: 'Virement', start: '2026-11-26T14:00:00+01:00', end: '2026-11-26T15:00:00+01:00' },
};

describe.skipIf(skipDb)('validation forte (actions sensibles)', () => {
  it('notifie sans boutons et refuse la validation depuis la notification', async () => {
    const userId = await createUser();
    const created = await requestAction(userId, { action: sensitiveAction, summary: 'Action sensible', conversationId: null, trigger: 'agent' });
    if (created.status !== 'pending') throw new Error('attendu : en attente');

    const push = sent.find((entry) => entry.payload.url === `/actions/${created.actionId}`)!;
    expect(push.payload).toMatchObject({ title: 'Validation requise' });
    expect(push.payload.action).toBeUndefined();
    const [row] = await db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, created.actionId));
    expect(row?.risk).toBe('sensitive');
  });

  it('exige Face ID récent quand une passkey existe, puis exécute', async () => {
    const userId = await createUser();
    await addPasskey(userId);
    const sessionId = await sessionFor(userId);
    const created = await requestAction(userId, { action: sensitiveAction, summary: 'Action sensible', conversationId: null, trigger: 'agent' });
    if (created.status !== 'pending') throw new Error('attendu : en attente');

    await expect(decideAction(created.actionId, { decision: 'approve' }, { userId, sessionId })).rejects.toMatchObject({ code: 'step_up_required' });
    await db.insert(schema.stepUps).values({ sessionId, verifiedAt: new Date() });
    await expect(decideAction(created.actionId, { decision: 'approve' }, { userId, sessionId })).resolves.toMatchObject({ status: 'executed' });
  });

  it("refuse une vérification trop ancienne, mais laisse toujours refuser l'action", async () => {
    const userId = await createUser();
    await addPasskey(userId);
    const sessionId = await sessionFor(userId);
    await db.insert(schema.stepUps).values({ sessionId, verifiedAt: new Date(Date.now() - 10 * 60_000) });
    const created = await requestAction(userId, { action: sensitiveAction, summary: 'Action sensible', conversationId: null, trigger: 'agent' });
    if (created.status !== 'pending') throw new Error('attendu : en attente');

    await expect(decideAction(created.actionId, { decision: 'approve' }, { userId, sessionId })).rejects.toMatchObject({ code: 'step_up_required' });
    await expect(decideAction(created.actionId, { decision: 'reject' }, { userId, sessionId })).resolves.toMatchObject({ status: 'rejected' });
  });

  it('respecte le réglage « Face ID pour les actions sensibles » désactivé', async () => {
    const userId = await createUser();
    await addPasskey(userId);
    await updateSettings(userId, { biometricForSensitive: false });
    const sessionId = await sessionFor(userId);
    const created = await requestAction(userId, { action: sensitiveAction, summary: 'Action sensible', conversationId: null, trigger: 'agent' });
    if (created.status !== 'pending') throw new Error('attendu : en attente');
    await expect(decideAction(created.actionId, { decision: 'approve' }, { userId, sessionId })).resolves.toMatchObject({ status: 'executed' });
  });
});

const steps = [
  { type: 'reminder' as const, text: 'Faire une pause', offsetMinutes: 90, label: 'Pause dans 1 h 30' },
  { type: 'notify' as const, text: 'Bonne journée !', label: 'Notification' },
];

describe.skipIf(skipDb)('routines', () => {
  it('exécute toutes les étapes et enregistre le résultat', async () => {
    const userId = await createUser();
    const routine = await routines.createRoutine(userId, { name: 'Mode travail', icon: 'laptop', enabled: true, schedule: null, steps });
    const run = await routines.runRoutine(userId, routine.id, 'manual');

    expect(run.status).toBe('success');
    expect(run.steps.map((step) => step.status)).toEqual(['success', 'success']);
    expect(await listReminders(userId)).toHaveLength(1);
    expect(sent.some((entry) => entry.userId === userId && entry.payload.body === 'Bonne journée !')).toBe(true);
  });

  it('continue après une étape en échec (Hue non connecté) : exécution partielle', async () => {
    const userId = await createUser();
    const routine = await routines.createRoutine(userId, {
      name: 'Départ maison', icon: 'door-exit', enabled: true, schedule: null,
      steps: [{ type: 'hue.set_room', payload: { roomId: 'all', on: false }, label: 'Éteindre toutes les lampes' }, steps[1]!],
    });
    const run = await routines.runRoutine(userId, routine.id, 'manual');
    expect(run.status).toBe('partial');
    expect(run.steps[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Philips Hue') });
    expect(run.steps[1]!.status).toBe('success');
  });

  it("déclenche une routine horaire une seule fois à l'heure locale, et jamais si elle est en pause", async () => {
    const userId = await createUser();
    await updateSettings(userId, { timezone: 'Europe/Paris' });
    const routine = await routines.createRoutine(userId, { name: 'Bonjour', icon: 'sun', enabled: true, schedule: { time: '07:30', days: [6] }, steps: [steps[1]!] });
    const paused = await routines.createRoutine(userId, { name: 'En pause', icon: 'moon', enabled: false, schedule: { time: '07:30', days: [6] }, steps: [steps[1]!] });
    const saturday0730 = new Date('2026-11-14T06:30:20Z'); // samedi 07:30 à Paris

    await routines.runScheduledRoutines(new Date('2026-11-14T06:29:00Z'));
    await routines.runScheduledRoutines(saturday0730);
    await routines.runScheduledRoutines(new Date('2026-11-14T06:30:50Z'));

    const runs = await db.select().from(schema.routineRuns).where(eq(schema.routineRuns.userId, userId));
    expect(runs.filter((run) => run.routineId === routine.id)).toHaveLength(1);
    expect(runs.filter((run) => run.routineId === paused.id)).toHaveLength(0);
  });

  it("n'expose pas les routines d'un autre utilisateur", async () => {
    const userId = await createUser();
    const intruder = await createUser();
    const routine = await routines.createRoutine(userId, { name: 'Privée', icon: 'house', enabled: true, schedule: null, steps });
    await expect(routines.runRoutine(intruder, routine.id, 'manual')).rejects.toMatchObject({ code: 'not_found' });
    expect(await routines.listRoutines(intruder)).toEqual([]);
  });
});

describe.skipIf(skipDb)('tags NFC', () => {
  it("lance la routine du tag, compte le scan, et ne marche que pour son propriétaire", async () => {
    const userId = await createUser();
    const intruder = await createUser();
    const routine = await routines.createRoutine(userId, { name: 'Bonne nuit', icon: 'moon', enabled: true, schedule: null, steps: [steps[1]!] });
    const tag = await tags.createTag(userId, { name: 'Chevet', icon: 'bed', routineId: routine.id });
    expect(tag.publicId.length).toBeGreaterThanOrEqual(22);

    const { run } = await tags.scanTag(userId, tag.publicId);
    expect(run).toMatchObject({ status: 'success', trigger: 'tag' });
    expect((await tags.listTags(userId))[0]!.scanCount).toBe(1);
    await expect(tags.scanTag(intruder, tag.publicId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it("n'exécute plus rien une fois révoqué", async () => {
    const userId = await createUser();
    const tag = await tags.createTag(userId, { name: 'Entrée', icon: 'door-exit', routineId: null });
    await tags.revokeTag(userId, tag.id);
    await expect(tags.scanTag(userId, tag.publicId)).rejects.toMatchObject({ code: 'not_found' });
    expect(await tags.listTags(userId)).toEqual([]);
  });
});

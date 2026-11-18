import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { createUser, sampleAnalysis, skipDb } from './helpers';

vi.mock('../../server/services/push', () => ({ sendToUser: vi.fn() }));

const { listJournal } = await import('../../server/services/journal');

/** Instant fixe, décalé de `minutes` : chaque entrée du journal a une date distincte et connue. */
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 18, 12, minutes));

async function addActivity(userId: string, minutes: number, values: Partial<typeof schema.activityLog.$inferInsert> = {}) {
  await db.insert(schema.activityLog).values({
    userId, type: 'hue.set_room', payload: {}, summary: `Activité ${minutes}`, trigger: 'agent', status: 'executed', createdAt: at(minutes), ...values,
  });
}

async function addDecidedAction(userId: string, minutes: number, status: typeof schema.pendingActions.$inferInsert['status']) {
  await db.insert(schema.pendingActions).values({
    userId, type: 'google_calendar.create_event', payload: {}, summary: `Action ${status}`, status, tokenHash: randomUUID(),
    expiresAt: at(minutes + 15), createdAt: at(minutes), updatedAt: at(minutes),
  });
}

async function addDocument(userId: string, minutes: number, status: 'ready' | 'failed' | 'pending', deletedAt: Date | null = null) {
  await db.insert(schema.files).values({
    userId, name: `doc-${minutes}.pdf`, mimeType: 'application/pdf', sizeBytes: 1, storageKey: randomUUID(), status, deletedAt,
    analysis: status === 'ready' ? { ...sampleAnalysis, keyInfo: { ...sampleAnalysis.keyInfo, amounts: [{ label: 'Total', value: '12 €' }] } } : null,
    error: status === 'failed' ? 'PDF illisible' : null, processedAt: at(minutes),
  } as typeof schema.files.$inferInsert);
}

async function addRun(userId: string, routineId: string, minutes: number, values: Partial<typeof schema.routineRuns.$inferInsert> = {}) {
  await db.insert(schema.routineRuns).values({
    userId, routineId, trigger: 'manual', status: 'success', durationMs: 10, createdAt: at(minutes),
    steps: [{ label: 'Éteindre', status: 'success', durationMs: 5, error: null }], ...values,
  });
}

async function addRoutine(userId: string, name = 'Bonne nuit') {
  const [routine] = await db.insert(schema.routines).values({ userId, name, icon: 'moon', steps: [] }).returning();
  return routine!.id;
}

describe.skipIf(skipDb)('journal d’activité', () => {
  it('fusionne actions, documents et routines, du plus récent au plus ancien', async () => {
    const userId = await createUser();
    const routineId = await addRoutine(userId);
    await addActivity(userId, 1);
    await addDecidedAction(userId, 2, 'rejected');
    await addDocument(userId, 3, 'ready');
    await addRun(userId, routineId, 4);

    const { entries, hasMore } = await listJournal(userId);
    expect(hasMore).toBe(false);
    expect(entries.map((entry) => [entry.category, entry.title])).toEqual([
      ['routines', 'Routine « Bonne nuit »'],
      ['documents', 'doc-3.pdf analysé'],
      ['actions', 'Action rejected'],
      ['actions', 'Activité 1'],
    ]);
    expect(entries[1]).toMatchObject({ icon: 'file', status: 'success', detail: '1 infos clés · 0 suggestions', origin: 'Agent' });
  });

  it("décrit l'issue de chaque action soumise à validation", async () => {
    const userId = await createUser();
    await addDecidedAction(userId, 1, 'executed');
    await addDecidedAction(userId, 2, 'failed');
    await addDecidedAction(userId, 3, 'rejected');
    await addDecidedAction(userId, 4, 'expired');
    await addDecidedAction(userId, 5, 'approved');
    await addDecidedAction(userId, 6, 'pending');

    const byTitle = Object.fromEntries((await listJournal(userId)).entries.map((entry) => [entry.title, entry]));
    expect(byTitle['Action executed']).toMatchObject({ status: 'success', icon: 'calendar', origin: 'Validé par vous' });
    expect(byTitle['Action failed']).toMatchObject({ status: 'failed', icon: 'triangle-exclamation', origin: 'Validé par vous' });
    expect(byTitle['Action rejected']).toMatchObject({ status: 'refused', icon: 'ban', origin: 'Refusée par vous' });
    expect(byTitle['Action expired']).toMatchObject({ status: 'expired', icon: 'hourglass', origin: 'Non validée sous 15 min' });
    // Non-régression : une action validée en cours d'exécution était affichée « Refusée par vous ».
    expect(byTitle['Action approved']).toMatchObject({ status: 'success', origin: 'Validé par vous' });
    // Une action encore à valider n'est pas dans le journal.
    expect(byTitle['Action pending']).toBeUndefined();
  });

  it("indique l'origine et l'issue des actions directes, sans doubler celles des routines", async () => {
    const userId = await createUser();
    await addActivity(userId, 1, { trigger: 'agent', summary: 'Par l’agent' });
    await addActivity(userId, 2, { trigger: 'tag', summary: 'Par un tag', type: 'reminder.create' });
    await addActivity(userId, 3, { trigger: 'panel', summary: 'Depuis le panneau', status: 'failed', error: 'Pont injoignable' });
    await addActivity(userId, 4, { trigger: 'panel', summary: 'Annulée', status: 'undone', type: 'inconnu' });
    await addActivity(userId, 5, { trigger: 'routine', summary: 'Étape de routine' });

    const byTitle = Object.fromEntries((await listJournal(userId)).entries.map((entry) => [entry.title, entry]));
    expect(byTitle['Par l’agent']).toMatchObject({ origin: 'Agent', icon: 'lightbulb', status: 'success' });
    expect(byTitle['Par un tag']).toMatchObject({ origin: 'Tag NFC', icon: 'bell' });
    expect(byTitle['Depuis le panneau']).toMatchObject({ origin: 'Vous', icon: 'triangle-exclamation', status: 'failed', detail: 'Pont injoignable' });
    expect(byTitle['Annulée']).toMatchObject({ status: 'undone', icon: 'check' });
    expect(byTitle['Étape de routine']).toBeUndefined();
  });

  it('résume une exécution de routine partielle avec l’étape en échec', async () => {
    const userId = await createUser();
    const routineId = await addRoutine(userId, 'Départ');
    await addRun(userId, routineId, 1, {
      trigger: 'tag',
      status: 'partial',
      steps: [
        { label: 'Éteindre', status: 'failed', durationMs: 1, error: 'Hue non connecté' },
        { label: 'Rappel', status: 'success', durationMs: 1, error: null },
      ],
    });
    await addRun(userId, routineId, 2, { trigger: 'schedule', status: 'failed' });
    await addRun(userId, routineId, 3, { trigger: 'agent' });

    const [agent, scheduled, tag] = (await listJournal(userId)).entries;
    expect(tag).toMatchObject({ icon: 'nfc', status: 'failed', origin: 'Tag NFC', detail: '1/2 actions · Éteindre : Hue non connecté' });
    expect(scheduled).toMatchObject({ icon: 'triangle-exclamation', origin: 'Programmée' });
    expect(agent).toMatchObject({ icon: 'repeat', origin: 'Agent', detail: '1/1 actions' });
  });

  it("n'affiche ni les documents à la corbeille, ni ceux en attente, et signale les échecs", async () => {
    const userId = await createUser();
    await addDocument(userId, 1, 'failed');
    await addDocument(userId, 2, 'pending');
    await addDocument(userId, 3, 'ready', new Date());

    expect((await listJournal(userId)).entries).toEqual([
      expect.objectContaining({ title: 'doc-1.pdf non analysé', status: 'failed', detail: 'PDF illisible', icon: 'triangle-exclamation' }),
    ]);
  });

  it('pagine par date, routines comprises', async () => {
    const userId = await createUser();
    const routineId = await addRoutine(userId);
    for (const minutes of [1, 2, 3]) await addRun(userId, routineId, minutes);
    await addActivity(userId, 4);

    const first = await listJournal(userId, { limit: 2 });
    expect(first.hasMore).toBe(true);
    expect(first.entries.map((entry) => entry.createdAt)).toEqual([at(4).toISOString(), at(3).toISOString()]);

    // Non-régression : seules les dernières exécutions étaient lues, puis filtrées par date ; la page suivante était vide.
    const second = await listJournal(userId, { limit: 2, before: at(3) });
    expect(second.entries.map((entry) => entry.createdAt)).toEqual([at(2).toISOString(), at(1).toISOString()]);
  });

  it("n'expose pas le journal d'un autre utilisateur", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await addActivity(alice, 1);
    await addDecidedAction(alice, 2, 'executed');
    await addDocument(alice, 3, 'ready');
    await addRun(alice, await addRoutine(alice), 4);
    expect((await listJournal(bob)).entries).toEqual([]);
  });
});

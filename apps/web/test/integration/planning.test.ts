import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import type { PushPayload } from '../../server/services/push';
import { createUser, sampleAnalysis, skipDb, textStream } from './helpers';

const sent: { userId: string; payload: PushPayload }[] = [];
vi.mock('../../server/services/push', () => ({
  sendToUser: vi.fn(async (userId: string, payload: PushPayload) => void sent.push({ userId, payload })),
}));
const scheduled: { name: string; data: { reminderId?: string }; options: unknown }[] = [];
vi.mock('../../server/jobs/boss', () => ({
  getBoss: async () => ({ send: async (name: string, data: { reminderId?: string }, options: unknown) => void scheduled.push({ name, data, options }) }),
}));
vi.mock('../../server/services/tasks', () => ({ enqueueTask: vi.fn(async () => 'job'), cancelTasksFor: vi.fn() }));

const { requestAction } = await import('../../server/services/actions');
const { undoActivity, listActivity } = await import('../../server/services/activity');
const reminders = await import('../../server/services/reminders');
const { runDigests, localParts } = await import('../../server/services/digest');
const { updateSettings } = await import('../../server/services/settings');
const { getAgenda } = await import('../../server/services/agenda');
const files = await import('../../server/services/files');

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe.skipIf(skipDb)('actions directes et journal', () => {
  it('exécute un rappel demandé par l’agent sans validation, et le journalise', async () => {
    const userId = await createUser();
    const response = await requestAction(userId, {
      action: { type: 'reminder.create', payload: { text: 'Payer EDF', remindAt: inOneHour() } },
      summary: 'Rappel « Payer EDF »',
      conversationId: null,
      trigger: 'agent',
    });

    expect(response.status).toBe('executed');
    const [entry] = await listActivity(userId);
    expect(entry).toMatchObject({ type: 'reminder.create', trigger: 'agent', status: 'executed', undoable: true });
    expect(await reminders.listReminders(userId)).toHaveLength(1);
    expect(scheduled.at(-1)).toMatchObject({ name: 'reminders.fire', options: { startAfter: expect.any(Date) } });
  });

  it('annule une action directe depuis le journal, une seule fois', async () => {
    const userId = await createUser();
    await requestAction(userId, {
      action: { type: 'reminder.create', payload: { text: 'Appeler la mutuelle', remindAt: inOneHour() } },
      summary: 'Rappel', conversationId: null, trigger: 'agent',
    });
    const [entry] = await listActivity(userId);

    await expect(undoActivity(userId, entry!.id)).resolves.toMatchObject({ status: 'undone', undoable: false });
    expect(await reminders.listReminders(userId)).toHaveLength(0);
    await expect(undoActivity(userId, entry!.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it("n'annule pas l'activité d'un autre utilisateur", async () => {
    const userId = await createUser();
    const intruder = await createUser();
    await requestAction(userId, {
      action: { type: 'reminder.create', payload: { text: 'Privé', remindAt: inOneHour() } },
      summary: 'Rappel', conversationId: null, trigger: 'agent',
    });
    const [entry] = await listActivity(userId);
    await expect(undoActivity(intruder, entry!.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe.skipIf(skipDb)('rappels', () => {
  it('envoie le rappel une seule fois, avec les boutons Fait / +1 h', async () => {
    const userId = await createUser();
    const reminder = await reminders.createReminder(userId, { text: 'Sortir les poubelles', remindAt: inOneHour(), source: 'user' });
    const job = { reminderId: reminder.id, remindAt: reminder.remindAt };

    await reminders.fireReminder(job);
    await reminders.fireReminder(job);

    const pushes = sent.filter((entry) => entry.payload.reminder?.id === reminder.id);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.payload).toMatchObject({ title: 'Rappel', body: 'Sortir les poubelles', url: '/planning' });
    expect((await reminders.listReminders(userId))[0]!.status).toBe('sent');
  });

  it("ignore l'ancien job d'un rappel reprogrammé", async () => {
    const userId = await createUser();
    const reminder = await reminders.createReminder(userId, { text: 'Réunion', remindAt: inOneHour(), source: 'user' });
    await reminders.snoozeReminder(userId, reminder.id, 30);

    await reminders.fireReminder({ reminderId: reminder.id, remindAt: reminder.remindAt });
    expect(sent.some((entry) => entry.payload.reminder?.id === reminder.id)).toBe(false);
    expect(scheduled.filter((job) => job.data.reminderId === reminder.id)).toHaveLength(2);
  });

  it('refuse un rappel dans le passé ou lié au document d’un autre utilisateur', async () => {
    const userId = await createUser();
    const other = await createUser();
    const file = await files.uploadFile(other, { fileName: 'a.txt', stream: textStream('secret') });
    await expect(reminders.createReminder(userId, { text: 'x', remindAt: '2020-01-01T00:00:00Z', source: 'user' }))
      .rejects.toMatchObject({ code: 'validation' });
    await expect(reminders.createReminder(userId, { text: 'x', remindAt: inOneHour(), fileId: file.id, source: 'user' }))
      .rejects.toMatchObject({ code: 'not_found' });
  });
});

describe.skipIf(skipDb)('résumé quotidien', () => {
  it("calcule l'heure locale dans le fuseau de l'utilisateur", () => {
    expect(localParts(new Date('2026-11-14T07:30:00Z'), 'Europe/Paris')).toEqual({ day: '2026-11-14', hour: 8 });
    expect(localParts(new Date('2026-11-14T02:00:00Z'), 'America/New_York')).toEqual({ day: '2026-11-13', hour: 21 });
  });

  it("n'envoie qu'à l'heure choisie, une fois par jour", async () => {
    const userId = await createUser();
    await updateSettings(userId, { digestEnabled: true, digestHour: 8, timezone: 'Europe/Paris' });
    const digestsFor = () => sent.filter((entry) => entry.userId === userId && entry.payload.tag === 'digest');

    await runDigests(new Date('2026-11-14T06:30:00Z')); // 7h30 à Paris
    expect(digestsFor()).toHaveLength(0);
    await runDigests(new Date('2026-11-14T07:10:00Z')); // 8h10
    await runDigests(new Date('2026-11-14T07:50:00Z')); // 8h50, même jour
    expect(digestsFor()).toHaveLength(1);
    expect(digestsFor()[0]!.payload).toMatchObject({ title: 'Votre journée', url: '/' });
  });
});

describe.skipIf(skipDb)('planning', () => {
  it('liste rappels et échéances détectées dans les documents, triés', async () => {
    const userId = await createUser();
    const file = await files.uploadFile(userId, { fileName: 'facture.md', stream: textStream('Facture') });
    await files.saveFileIndex(userId, file.id, {
      embedModel: 'bge-m3', text: 'Facture', chunks: [],
      analysis: {
        ...sampleAnalysis,
        keyInfo: {
          dates: [
            { label: 'Échéance de paiement', value: '15 novembre 2026', iso: '2026-11-15', isDeadline: true },
            { label: 'Date de facture', value: '2 octobre 2026', iso: '2026-10-02', isDeadline: false },
          ],
          amounts: [], names: [],
        },
      },
    });
    await reminders.createReminder(userId, { text: 'Préparer le virement', remindAt: '2026-11-14T08:00:00Z', source: 'user' }).catch(async () => {
      // Date déjà passée selon l'horloge du test : on insère directement.
      await db.insert(schema.reminders).values({ userId, text: 'Préparer le virement', remindAt: new Date('2026-11-14T08:00:00Z'), source: 'user' });
    });

    const agenda = await getAgenda(userId, new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'));
    expect(agenda.calendarConnected).toBe(false);
    expect(agenda.items.map((item) => `${item.kind}:${item.title}`)).toEqual(['reminder:Préparer le virement', 'deadline:Échéance de paiement']);
  });
});

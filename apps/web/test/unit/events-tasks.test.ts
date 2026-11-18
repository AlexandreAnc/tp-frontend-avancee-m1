import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ClientEvent } from '#shared/types/events';
import { isUserConnected, publishToAll, publishToUser, subscribe } from '../../server/services/events';
import { cancelTasksFor, enqueueTask, taskEvents, type TaskSubject } from '../../server/services/tasks';

const send = vi.fn(async () => 'job-1');
vi.mock('../../server/jobs/boss', () => ({ getBoss: async () => ({ send }) }));

describe('bus d’événements temps réel', () => {
  const event: ClientEvent = { type: 'file.deleted', fileId: 'f1' };

  it("n'envoie les événements d'un utilisateur qu'à ses propres connexions", () => {
    const alice: ClientEvent[] = [];
    const bob: ClientEvent[] = [];
    const stopAlice = subscribe('alice', (received) => alice.push(received));
    const stopBob = subscribe('bob', (received) => bob.push(received));

    publishToUser('alice', event);
    expect(alice).toEqual([event]);
    expect(bob).toEqual([]);

    publishToAll({ type: 'agent.status', online: false, agent: null });
    expect(alice).toHaveLength(2);
    expect(bob).toHaveLength(1);
    stopAlice();
    stopBob();
  });

  it("sait si l'utilisateur a l'app ouverte, et l'oublie à la déconnexion", () => {
    expect(isUserConnected('carol')).toBe(false);
    const received: ClientEvent[] = [];
    const unsubscribe = subscribe('carol', (value) => received.push(value));
    expect(isUserConnected('carol')).toBe(true);
    unsubscribe();
    expect(isUserConnected('carol')).toBe(false);
    publishToUser('carol', event);
    publishToAll(event);
    expect(received).toEqual([]);
  });
});

describe('file de tâches', () => {
  const payload = { conversationId: randomUUID(), messageId: randomUUID(), history: [{ role: 'user' as const, content: 'Bonjour' }] };

  it('valide la charge utile, la met en file et prévient la passerelle', async () => {
    const enqueued = vi.fn();
    taskEvents.on('enqueued', enqueued);
    await expect(enqueueTask('chat.reply', 'u1', payload, { singletonKey: 'chat.reply:m1' })).resolves.toBe('job-1');
    expect(send).toHaveBeenCalledWith('chat.reply', { userId: 'u1', payload }, { singletonKey: 'chat.reply:m1' });
    expect(enqueued).toHaveBeenCalledWith('chat.reply');

    await enqueueTask('chat.reply', 'u1', payload);
    expect(send).toHaveBeenLastCalledWith('chat.reply', { userId: 'u1', payload }, {});
    taskEvents.off('enqueued', enqueued);
  });

  it("n'enfile jamais une charge utile invalide", async () => {
    send.mockClear();
    await expect(enqueueTask('file.index', 'u1', { fileId: 'pas-un-uuid', fileName: 'a.pdf', mimeType: 'application/pdf' })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('annonce l’annulation des tâches liées à ce que l’utilisateur supprime', () => {
    const cancelled: TaskSubject[] = [];
    const listener = (subject: TaskSubject) => cancelled.push(subject);
    taskEvents.on('cancel', listener);
    cancelTasksFor({ userId: 'u1', fileId: 'f1' });
    cancelTasksFor({ userId: 'u1', all: true });
    expect(cancelled).toEqual([{ userId: 'u1', fileId: 'f1' }, { userId: 'u1', all: true }]);
    taskEvents.off('cancel', listener);
  });
});

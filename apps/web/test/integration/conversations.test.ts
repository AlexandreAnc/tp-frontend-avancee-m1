import { MAX_CHAT_MESSAGE_LENGTH } from '@app/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ClientEvent } from '#shared/types/events';
import type { PushPayload } from '../../server/services/push';
import { createUser, skipDb } from './helpers';

const enqueueTask = vi.fn(async () => 'job');
const cancelTasksFor = vi.fn();
vi.mock('../../server/services/tasks', () => ({
  enqueueTask: (...args: unknown[]) => enqueueTask(...(args as [])),
  cancelTasksFor: (...args: unknown[]) => cancelTasksFor(...(args as [])),
}));
const sent: { userId: string; payload: PushPayload }[] = [];
vi.mock('../../server/services/push', () => ({
  sendToUser: vi.fn(async (userId: string, payload: PushPayload) => void sent.push({ userId, payload })),
}));

const chat = await import('../../server/services/conversations');
const { subscribe } = await import('../../server/services/events');
const { updateSettings } = await import('../../server/services/settings');

/** Dernière tâche `chat.reply` mise en file : ce que l'agent recevra. */
function lastReplyTask() {
  const call = enqueueTask.mock.calls.at(-1) as unknown as [string, string, { messageId: string; history: { role: string; content: string }[] }, { singletonKey: string }];
  return { type: call[0], userId: call[1], payload: call[2], options: call[3] };
}

describe.skipIf(skipDb)('conversations', () => {
  it('crée une conversation titrée par le premier message et transmet la demande à l’agent', async () => {
    const userId = await createUser();
    const { conversationId, message } = await chat.startConversation(userId, '  Quelles factures\n  dois-je payer   ce mois-ci ?  ');

    expect(message).toMatchObject({ role: 'user', content: 'Quelles factures\n  dois-je payer   ce mois-ci ?', status: 'queued' });
    expect(await chat.listConversations(userId)).toEqual([{ id: conversationId, title: 'Quelles factures dois-je payer ce mois-ci ?', updatedAt: expect.any(String) }]);
    expect(lastReplyTask()).toMatchObject({
      type: 'chat.reply',
      userId,
      payload: { conversationId, messageId: message.id, history: [{ role: 'user', content: message.content }] },
      options: { singletonKey: `chat.reply:${message.id}` },
    });
    expect(await chat.countPendingMessages(userId)).toBe(1);
  });

  it('tronque un titre trop long', async () => {
    const userId = await createUser();
    await chat.startConversation(userId, 'a'.repeat(100));
    const [conversation] = await chat.listConversations(userId);
    expect(conversation!.title).toHaveLength(60);
    expect(conversation!.title.endsWith('…')).toBe(true);
  });

  it('refuse un message vide ou trop long', async () => {
    const userId = await createUser();
    await expect(chat.startConversation(userId, '   ')).rejects.toMatchObject({ code: 'validation' });
    await expect(chat.startConversation(userId, 'x'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1))).rejects.toMatchObject({ code: 'validation' });
    expect(await chat.listConversations(userId)).toEqual([]);
  });

  it('limite le nombre de messages par minute', async () => {
    const userId = await createUser();
    const { conversationId } = await chat.startConversation(userId, 'Bonjour');
    for (let index = 1; index < 20; index++) await chat.postMessage(userId, conversationId, `Message ${index}`);
    await expect(chat.postMessage(userId, conversationId, 'Un de trop')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it("n'envoie à l'agent que l'historique jusqu'au message traité, réponses comprises", async () => {
    const userId = await createUser();
    const { conversationId, message } = await chat.startConversation(userId, 'Première question');
    await chat.saveAssistantReply(userId, { conversationId, messageId: message.id, content: 'Première réponse' });
    const second = await chat.postMessage(userId, conversationId, 'Deuxième question');

    expect(lastReplyTask().payload.history).toEqual([
      { role: 'user', content: 'Première question' },
      { role: 'assistant', content: 'Première réponse' },
      { role: 'user', content: 'Deuxième question' },
    ]);
    expect(lastReplyTask().payload.messageId).toBe(second.id);
  });

  it("enregistre une seule réponse par message, publie l'événement et notifie si l'app est fermée", async () => {
    const userId = await createUser();
    const { conversationId, message } = await chat.startConversation(userId, 'Résume ma facture');
    const events: ClientEvent[] = [];
    await chat.saveAssistantReply(userId, { conversationId, messageId: message.id, content: '**Montant** : 120 €' });

    // Une reprise de la tâche ne duplique pas la réponse ni la notification.
    const unsubscribe = subscribe(userId, (event) => events.push(event));
    await chat.saveAssistantReply(userId, { conversationId, messageId: message.id, content: 'Autre réponse' });
    unsubscribe();

    const conversation = await chat.getConversation(userId, conversationId);
    expect(conversation.messages.map((entry) => [entry.role, entry.content, entry.status])).toEqual([
      ['user', 'Résume ma facture', 'done'],
      ['assistant', '**Montant** : 120 €', null],
    ]);
    expect(events.map((event) => event.type)).toEqual(['message.status']);
    const notifications = sent.filter((entry) => entry.userId === userId);
    expect(notifications).toEqual([{ userId, payload: expect.objectContaining({ title: "Réponse de l'agent", body: 'Montant : 120 €', url: `/chat/${conversationId}` }) }]);
  });

  it("ne notifie pas une réponse si l'utilisateur a l'app ouverte ou l'a désactivé", async () => {
    const userId = await createUser();
    const first = await chat.startConversation(userId, 'Question 1');
    const unsubscribe = subscribe(userId, () => {});
    await chat.saveAssistantReply(userId, { conversationId: first.conversationId, messageId: first.message.id, content: 'Réponse 1' });
    unsubscribe();

    await updateSettings(userId, { notifyReplyReady: false });
    const second = await chat.startConversation(userId, 'Question 2');
    await chat.saveAssistantReply(userId, { conversationId: second.conversationId, messageId: second.message.id, content: 'Réponse 2' });
    expect(sent.filter((entry) => entry.userId === userId)).toEqual([]);
  });

  it('relaie le brouillon de la réponse au seul utilisateur concerné, sans rien enregistrer', async () => {
    const userId = await createUser();
    const other = await createUser();
    const { conversationId, message } = await chat.startConversation(userId, 'Bonjour');
    const events: ClientEvent[] = [];
    const otherEvents: ClientEvent[] = [];
    const unsubscribe = [subscribe(userId, (event) => events.push(event)), subscribe(other, (event) => otherEvents.push(event))];
    chat.publishDraft(userId, { conversationId, messageId: message.id, text: 'Bonjour, je' });
    unsubscribe.forEach((stop) => stop());

    expect(events).toEqual([{ type: 'message.draft', conversationId, messageId: message.id, text: 'Bonjour, je' }]);
    expect(otherEvents).toEqual([]);
    expect((await chat.getConversation(userId, conversationId)).messages).toHaveLength(1);
  });

  it('stocke les étapes de l’agent par message, et les efface quand la tâche est reprise', async () => {
    const userId = await createUser();
    const { conversationId, message } = await chat.startConversation(userId, 'Cherche mon bail');
    const events: ClientEvent[] = [];
    const unsubscribe = subscribe(userId, (event) => events.push(event));
    await chat.appendStep(userId, { conversationId, messageId: message.id, position: 1, step: { kind: 'tool_call', tool: 'search', input: { query: 'bail' } } });
    await chat.appendStep(userId, { conversationId, messageId: message.id, position: 0, step: { kind: 'thinking', text: 'Je cherche' } });
    unsubscribe();

    const { steps } = await chat.getConversation(userId, conversationId);
    expect(steps[message.id]!.map((entry) => entry.step.kind)).toEqual(['thinking', 'tool_call']);
    expect(events).toEqual([
      expect.objectContaining({ type: 'agent.step', messageId: message.id, position: 1 }),
      expect.objectContaining({ type: 'agent.step', messageId: message.id, position: 0 }),
    ]);

    await chat.clearSteps(userId, message.id);
    expect((await chat.getConversation(userId, conversationId)).steps).toEqual({});
  });

  it('relance un message en échec, et seulement celui-là', async () => {
    const userId = await createUser();
    const { conversationId, message } = await chat.startConversation(userId, 'Question');
    await expect(chat.retryMessage(userId, message.id)).rejects.toMatchObject({ code: 'conflict' });

    await chat.setMessageStatus(userId, message.id, 'failed');
    enqueueTask.mockClear();
    await chat.retryMessage(userId, message.id);
    expect(lastReplyTask().payload).toMatchObject({ conversationId, messageId: message.id });
    expect((await chat.getConversation(userId, conversationId)).messages[0]!.status).toBe('queued');
  });

  it('supprime une conversation ou tout l’historique, et annule les réponses en cours', async () => {
    const userId = await createUser();
    const first = await chat.startConversation(userId, 'Une');
    await chat.startConversation(userId, 'Deux');

    await chat.deleteConversation(userId, first.conversationId);
    expect(cancelTasksFor).toHaveBeenLastCalledWith({ userId, conversationId: first.conversationId });
    expect(await chat.conversationExists(userId, first.conversationId)).toBe(false);
    await expect(chat.deleteConversation(userId, first.conversationId)).rejects.toMatchObject({ code: 'not_found' });

    expect(await chat.deleteAllConversations(userId)).toBe(1);
    expect(cancelTasksFor).toHaveBeenLastCalledWith({ userId, all: true });
    expect(await chat.listConversations(userId)).toEqual([]);
    expect(await chat.countPendingMessages(userId)).toBe(0);
  });

  it("isole les conversations : un autre utilisateur ne peut ni lire, ni écrire, ni relancer, ni supprimer", async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const { conversationId, message } = await chat.startConversation(alice, 'Mon code de carte');
    await chat.setMessageStatus(alice, message.id, 'failed');

    expect(await chat.listConversations(bob)).toEqual([]);
    expect(await chat.conversationExists(bob, conversationId)).toBe(false);
    await expect(chat.getConversation(bob, conversationId)).rejects.toMatchObject({ code: 'not_found' });
    await expect(chat.postMessage(bob, conversationId, 'Intrusion')).rejects.toMatchObject({ code: 'not_found' });
    await expect(chat.retryMessage(bob, message.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(chat.deleteConversation(bob, conversationId)).rejects.toMatchObject({ code: 'not_found' });
    expect(await chat.deleteAllConversations(bob)).toBe(0);

    // Les écritures de l'agent pour Bob n'atteignent pas les messages d'Alice.
    await chat.setMessageStatus(bob, message.id, 'done');
    expect((await chat.getConversation(alice, conversationId)).messages).toHaveLength(1);
    expect((await chat.getConversation(alice, conversationId)).messages[0]!.status).toBe('failed');
  });
});

import { MAX_CHAT_MESSAGE_LENGTH, type AgentStep } from '@app/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { ChatMessage } from '#shared/types/events';
import { db, schema } from '../db';
import { AppError, notFound } from '../utils/errors';
import { chatRateLimit } from '../utils/rate-limit';
import { publishToUser } from './events';
import { notifyIfAway } from './notify';
import { cancelTasksFor, enqueueTask } from './tasks';

const { conversations, messages, agentSteps } = schema;

/** Nombre de messages précédents transmis à l'agent comme contexte. */
const HISTORY_LENGTH = 20;
const TITLE_LENGTH = 60;

type MessageRow = typeof messages.$inferSelect;
type MessageStatus = NonNullable<MessageRow['status']>;

function toMessageDto(message: MessageRow): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    replyToId: message.replyToId,
    createdAt: message.createdAt.toISOString(),
  };
}

function validateContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw new AppError('validation', 'Le message est vide');
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new AppError('validation', `Le message dépasse ${MAX_CHAT_MESSAGE_LENGTH} caractères`);
  }
  return trimmed;
}

function titleFrom(content: string): string {
  const singleLine = content.replace(/\s+/g, ' ');
  return singleLine.length > TITLE_LENGTH ? `${singleLine.slice(0, TITLE_LENGTH - 1)}…` : singleLine;
}

export async function listConversations(userId: string) {
  const rows = await db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
  return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() }));
}

async function requireConversation(userId: string, conversationId: string) {
  const [conversation] = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  if (!conversation) throw notFound('Conversation');
  return conversation;
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await requireConversation(userId, conversationId);
  const messageRows = await db.select().from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, userId)))
    .orderBy(asc(messages.createdAt));

  const userMessageIds = messageRows.filter((message) => message.role === 'user').map((message) => message.id);
  const stepRows = userMessageIds.length === 0 ? [] : await db.select().from(agentSteps)
    .where(and(eq(agentSteps.userId, userId), inArray(agentSteps.messageId, userMessageIds)))
    .orderBy(asc(agentSteps.position));

  const steps: Record<string, { position: number; step: AgentStep; at: string }[]> = {};
  for (const row of stepRows) {
    (steps[row.messageId] ??= []).push({ position: row.position, step: row.step, at: row.createdAt.toISOString() });
  }

  return {
    id: conversation.id,
    title: conversation.title,
    messages: messageRows.map(toMessageDto),
    steps,
  };
}

/** Efface tout l'historique des discussions (messages et étapes de l'agent en cascade). */
export async function deleteAllConversations(userId: string): Promise<number> {
  cancelTasksFor({ userId, all: true });
  const deleted = await db.delete(conversations).where(eq(conversations.userId, userId)).returning({ id: conversations.id });
  return deleted.length;
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const deleted = await db.delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });
  if (deleted.length === 0) throw notFound('Conversation');
  cancelTasksFor({ userId, conversationId });
}

/** Crée une conversation à partir du premier message et le transmet à l'agent. */
export async function startConversation(userId: string, content: string) {
  const text = validateContent(content);
  chatRateLimit(userId);
  const [conversation] = await db.insert(conversations).values({ userId, title: titleFrom(text) }).returning();
  const message = await insertUserMessage(userId, conversation!.id, text);
  return { conversationId: conversation!.id, message };
}

export async function postMessage(userId: string, conversationId: string, content: string): Promise<ChatMessage> {
  const text = validateContent(content);
  await requireConversation(userId, conversationId);
  chatRateLimit(userId);
  return insertUserMessage(userId, conversationId, text);
}

async function insertUserMessage(userId: string, conversationId: string, content: string): Promise<ChatMessage> {
  const [message] = await db.insert(messages).values({
    userId,
    conversationId,
    role: 'user',
    content,
    status: 'queued',
  }).returning();
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

  const dto = toMessageDto(message!);
  publishToUser(userId, { type: 'message.created', conversationId, message: dto });
  await enqueueReply(userId, conversationId, message!.id);
  return dto;
}

async function enqueueReply(userId: string, conversationId: string, messageId: string): Promise<void> {
  const recent = await db.select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, userId)))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LENGTH);

  // L'historique s'arrête au message traité (des messages plus récents ont pu arriver entre-temps).
  const ordered = recent.reverse();
  const end = ordered.findIndex((message) => message.id === messageId);
  const history = ordered.slice(0, end + 1).map(({ role, content }) => ({ role, content }));

  await enqueueTask('chat.reply', userId, { conversationId, messageId, history }, { singletonKey: `chat.reply:${messageId}` });
}

/** Relance l'agent sur un message dont le traitement a échoué. */
export async function retryMessage(userId: string, messageId: string): Promise<void> {
  const [message] = await db.select().from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId), eq(messages.role, 'user')));
  if (!message) throw notFound('Message');
  if (message.status !== 'failed') throw new AppError('conflict', "Ce message n'est pas en échec");
  chatRateLimit(userId);
  await setMessageStatus(userId, messageId, 'queued');
  await enqueueReply(userId, message.conversationId, messageId);
}

export async function setMessageStatus(userId: string, messageId: string, status: MessageStatus): Promise<void> {
  const [message] = await db.update(messages).set({ status })
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
    .returning({ conversationId: messages.conversationId });
  if (message) {
    publishToUser(userId, { type: 'message.status', conversationId: message.conversationId, messageId, status });
  }
}

/** Efface les étapes d'une tentative précédente quand une tâche est reprise. */
export async function clearSteps(userId: string, messageId: string): Promise<void> {
  await db.delete(agentSteps).where(and(eq(agentSteps.messageId, messageId), eq(agentSteps.userId, userId)));
}

export async function appendStep(userId: string, input: {
  conversationId: string;
  messageId: string;
  position: number;
  step: AgentStep;
}): Promise<void> {
  const [row] = await db.insert(agentSteps).values({
    userId,
    messageId: input.messageId,
    position: input.position,
    step: input.step,
  }).returning({ createdAt: agentSteps.createdAt });
  publishToUser(userId, { type: 'agent.step', ...input, at: row!.createdAt.toISOString() });
}

/** Enregistre la réponse de l'agent. Idempotent : une seule réponse par message utilisateur. */
export async function saveAssistantReply(userId: string, input: {
  conversationId: string;
  messageId: string;
  content: string;
}): Promise<void> {
  const [reply] = await db.insert(messages).values({
    userId,
    conversationId: input.conversationId,
    role: 'assistant',
    content: input.content,
    replyToId: input.messageId,
  }).onConflictDoNothing({ target: messages.replyToId }).returning();

  await setMessageStatus(userId, input.messageId, 'done');
  if (reply) {
    await db.update(conversations).set({ updatedAt: new Date() })
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, userId)));
    publishToUser(userId, { type: 'message.created', conversationId: input.conversationId, message: toMessageDto(reply) });
    await notifyIfAway(userId, 'replyReady', {
      title: "Réponse de l'agent",
      body: input.content.replace(/[*_`#>]/g, '').slice(0, 140),
      url: `/chat/${input.conversationId}`,
      tag: `reply-${input.conversationId}`,
    });
  }
}

/** Messages de l'utilisateur en attente ou en cours de traitement par l'agent. */
export async function countPendingMessages(userId: string): Promise<number> {
  const rows = await db.select({ id: messages.id }).from(messages)
    .where(and(eq(messages.userId, userId), inArray(messages.status, ['queued', 'processing'])));
  return rows.length;
}

export async function conversationExists(userId: string, conversationId: string): Promise<boolean> {
  const [row] = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return Boolean(row);
}

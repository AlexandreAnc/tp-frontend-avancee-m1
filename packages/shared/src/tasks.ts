import { z } from 'zod';

export const TASK_TYPES = ['file.index', 'chat.reply'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const fileIndexPayloadSchema = z.object({
  fileId: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
});

export const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const chatReplyPayloadSchema = z.object({
  conversationId: z.uuid(),
  /** Message utilisateur auquel l'agent répond. */
  messageId: z.uuid(),
  history: z.array(chatHistoryMessageSchema),
});

export const fileIndexResultSchema = z.object({
  chunkCount: z.number().int().nonnegative(),
});

export const chatReplyResultSchema = z.object({
  content: z.string(),
});

export const taskPayloadSchemas = {
  'file.index': fileIndexPayloadSchema,
  'chat.reply': chatReplyPayloadSchema,
} as const satisfies Record<TaskType, z.ZodType>;

export const taskResultSchemas = {
  'file.index': fileIndexResultSchema,
  'chat.reply': chatReplyResultSchema,
} as const satisfies Record<TaskType, z.ZodType>;

export type TaskPayload<T extends TaskType> = z.infer<(typeof taskPayloadSchemas)[T]>;
export type TaskResult<T extends TaskType> = z.infer<(typeof taskResultSchemas)[T]>;

export type FileIndexPayload = TaskPayload<'file.index'>;
export type ChatReplyPayload = TaskPayload<'chat.reply'>;

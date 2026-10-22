import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateToken, hashToken } from '../utils/crypto';
import { AppError } from '../utils/errors';

const { taskTokens } = schema;

/** Durée de vie maximale d'un token de tâche (la tâche la plus longue expire avant). */
const TASK_TOKEN_TTL_MS = 35 * 60 * 1000;

export interface TaskTokenScope {
  userId: string;
  taskId: string;
  conversationId: string | null;
}

export async function issueTaskToken(scope: TaskTokenScope): Promise<string> {
  const token = generateToken('tsk_');
  await db.insert(taskTokens).values({
    userId: scope.userId,
    taskId: scope.taskId,
    conversationId: scope.conversationId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TASK_TOKEN_TTL_MS),
  });
  return token;
}

export async function verifyTaskToken(token: string): Promise<TaskTokenScope> {
  const [row] = await db.select().from(taskTokens).where(and(
    eq(taskTokens.tokenHash, hashToken(token)),
    isNull(taskTokens.revokedAt),
    gt(taskTokens.expiresAt, new Date()),
  ));
  if (!row) throw new AppError('unauthorized', 'Token de tâche invalide ou expiré');
  return { userId: row.userId, taskId: row.taskId, conversationId: row.conversationId };
}

/** Invalide les tokens d'une tâche dès qu'elle est terminée, échouée ou annulée. */
export async function revokeTaskTokens(taskId: string): Promise<void> {
  await db.update(taskTokens).set({ revokedAt: new Date() })
    .where(and(eq(taskTokens.taskId, taskId), isNull(taskTokens.revokedAt)));
}

export async function purgeOldTaskTokens(): Promise<void> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(taskTokens).where(or(lt(taskTokens.expiresAt, dayAgo), lt(taskTokens.revokedAt, dayAgo)));
}

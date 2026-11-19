import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import type { TaskType } from '@app/shared';
import { db, schema } from '../db';
import { generateToken, hashToken } from '../utils/crypto';
import { AppError } from '../utils/errors';

const { taskTokens } = schema;

/** Durée de vie maximale d'un token de tâche (la tâche la plus longue expire avant). */
const TASK_TOKEN_TTL_MS = 35 * 60 * 1000;

export interface TaskTokenScope {
  userId: string;
  taskId: string;
  taskType: TaskType;
  conversationId: string | null;
}

export async function issueTaskToken(scope: TaskTokenScope): Promise<string> {
  const token = generateToken('tsk_');
  await db.insert(taskTokens).values({
    userId: scope.userId,
    taskId: scope.taskId,
    taskType: scope.taskType,
    conversationId: scope.conversationId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TASK_TOKEN_TTL_MS),
  });
  return token;
}

/**
 * Vérifie le token et que la route appelée sert bien ce type de tâche : un token d'indexation ne peut ni proposer
 * d'action ni lancer de routine, même si le document indexé pousse l'agent à essayer.
 */
export async function verifyTaskToken(token: string, allowed: readonly TaskType[]): Promise<TaskTokenScope> {
  const [row] = await db.select().from(taskTokens).where(and(
    eq(taskTokens.tokenHash, hashToken(token)),
    isNull(taskTokens.revokedAt),
    gt(taskTokens.expiresAt, new Date()),
  ));
  if (!row) throw new AppError('unauthorized', 'Token de tâche invalide ou expiré');
  if (!allowed.includes(row.taskType)) throw new AppError('forbidden', `Route non autorisée pour une tâche ${row.taskType}`);
  return { userId: row.userId, taskId: row.taskId, taskType: row.taskType, conversationId: row.conversationId };
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

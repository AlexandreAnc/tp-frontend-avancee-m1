import type { ActionTrigger, ProposedAction } from '@app/shared';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { canUndo, executeAction, undoAction } from '../connectors/registry';
import { AppError, notFound } from '../utils/errors';
import { publishToUser } from './events';

const { activityLog } = schema;

/** Délai pendant lequel une action directe peut être annulée depuis le journal. */
const UNDO_WINDOW_MS = 15 * 60 * 1000;

type ActivityRow = typeof activityLog.$inferSelect;

export function toActivityDto(row: ActivityRow) {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    summary: row.summary,
    trigger: row.trigger,
    triggerRef: row.triggerRef,
    status: row.status,
    result: row.result,
    error: row.error,
    undoable: row.status === 'executed' && canUndo(row.type) && Date.now() - row.createdAt.getTime() < UNDO_WINDOW_MS,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ActivityDto = ReturnType<typeof toActivityDto>;

/** Exécute une action de niveau `direct` et l'inscrit au journal, réussie ou non. */
export async function runDirectAction(userId: string, input: {
  action: ProposedAction;
  summary: string;
  trigger: ActionTrigger;
  triggerRef?: string | null;
}): Promise<ActivityDto> {
  let result: unknown = null;
  let error: string | null = null;
  try {
    result = await executeAction(userId, input.action);
  } catch (caught) {
    if (!(caught instanceof AppError)) console.error('[activity] exécution', caught);
    error = caught instanceof AppError ? caught.message : "L'action a échoué.";
  }

  const [row] = await db.insert(activityLog).values({
    userId,
    type: input.action.type,
    payload: input.action.payload,
    summary: input.summary,
    trigger: input.trigger,
    triggerRef: input.triggerRef ?? null,
    status: error ? 'failed' : 'executed',
    result,
    error,
  }).returning();
  publishToUser(userId, { type: 'activity.created', activityId: row!.id });
  return toActivityDto(row!);
}

export async function listActivity(userId: string, options: { before?: Date; limit?: number } = {}) {
  const rows = await db.select().from(activityLog)
    .where(and(eq(activityLog.userId, userId), options.before ? lt(activityLog.createdAt, options.before) : undefined))
    .orderBy(desc(activityLog.createdAt))
    .limit(Math.min(options.limit ?? 30, 100));
  return rows.map(toActivityDto);
}

export async function undoActivity(userId: string, activityId: string): Promise<ActivityDto> {
  const [row] = await db.select().from(activityLog).where(and(eq(activityLog.id, activityId), eq(activityLog.userId, userId)));
  if (!row) throw notFound('Activité');
  if (!toActivityDto(row).undoable) throw new AppError('conflict', 'Cette action ne peut plus être annulée.');

  await undoAction(userId, row.type as ProposedAction['type'], row.result);
  const [updated] = await db.update(activityLog).set({ status: 'undone' })
    .where(and(eq(activityLog.id, activityId), eq(activityLog.status, 'executed')))
    .returning();
  if (!updated) throw new AppError('conflict', 'Cette action a déjà été annulée.');
  publishToUser(userId, { type: 'activity.created', activityId });
  return toActivityDto(updated);
}

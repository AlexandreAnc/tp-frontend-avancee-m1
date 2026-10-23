import type { ProposedAction, RoutineInput, RoutineRunStatus, RoutineStep, RoutineStepResult, RoutineTrigger } from '@app/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { AppError, notFound } from '../utils/errors';
import { requestAction } from './actions';
import { startConversation } from './conversations';
import { localParts } from './digest';
import { publishToUser } from './events';
import { sendToUser } from './push';
import { createReminder } from './reminders';
import { getSettings } from './settings';

const { routines, routineRuns } = schema;

type RoutineRow = typeof routines.$inferSelect;
type RunRow = typeof routineRuns.$inferSelect;

export function toRunDto(run: RunRow) {
  return {
    id: run.id,
    routineId: run.routineId,
    trigger: run.trigger,
    status: run.status,
    steps: run.steps,
    durationMs: run.durationMs,
    createdAt: run.createdAt.toISOString(),
  };
}

export type RoutineRunDto = ReturnType<typeof toRunDto>;

export function toRoutineDto(row: RoutineRow, lastRun: RunRow | null = null) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    enabled: row.enabled,
    schedule: row.schedule,
    steps: row.steps,
    lastRun: lastRun ? toRunDto(lastRun) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type RoutineDto = ReturnType<typeof toRoutineDto>;

async function latestRuns(routineIds: string[]) {
  if (!routineIds.length) return new Map<string, RunRow>();
  const rows = await db.select().from(routineRuns).where(inArray(routineRuns.routineId, routineIds)).orderBy(desc(routineRuns.createdAt));
  const latest = new Map<string, RunRow>();
  for (const row of rows) if (!latest.has(row.routineId)) latest.set(row.routineId, row);
  return latest;
}

export async function listRoutines(userId: string): Promise<RoutineDto[]> {
  const rows = await db.select().from(routines).where(eq(routines.userId, userId)).orderBy(routines.createdAt);
  const runs = await latestRuns(rows.map((row) => row.id));
  return rows.map((row) => toRoutineDto(row, runs.get(row.id) ?? null));
}

export async function getRoutine(userId: string, routineId: string): Promise<RoutineRow> {
  const [row] = await db.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.userId, userId)));
  if (!row) throw notFound('Routine');
  return row;
}

export async function createRoutine(userId: string, input: RoutineInput): Promise<RoutineDto> {
  const [row] = await db.insert(routines).values({ userId, ...input }).returning();
  return toRoutineDto(row!);
}

export async function updateRoutine(userId: string, routineId: string, input: Partial<RoutineInput>): Promise<RoutineDto> {
  await getRoutine(userId, routineId);
  const [row] = await db.update(routines).set(input).where(and(eq(routines.id, routineId), eq(routines.userId, userId))).returning();
  const runs = await latestRuns([routineId]);
  return toRoutineDto(row!, runs.get(routineId) ?? null);
}

export async function deleteRoutine(userId: string, routineId: string): Promise<void> {
  const deleted = await db.delete(routines).where(and(eq(routines.id, routineId), eq(routines.userId, userId))).returning({ id: routines.id });
  if (!deleted.length) throw notFound('Routine');
}

/** Exécute une étape. Les actions passent par `requestAction` : niveau de risque et journal s'appliquent. */
async function runStep(userId: string, routine: RoutineRow, step: RoutineStep): Promise<Omit<RoutineStepResult, 'durationMs'>> {
  const context = { summary: `${step.label} · routine « ${routine.name} »`, conversationId: null, trigger: 'routine' as const, triggerRef: routine.id };
  switch (step.type) {
    case 'hue.set_room':
    case 'hue.activate_scene': {
      const action: ProposedAction = step.type === 'hue.set_room'
        ? { type: 'hue.set_room', payload: step.payload }
        : { type: 'hue.activate_scene', payload: step.payload };
      const response = await requestAction(userId, { ...context, action });
      return { label: step.label, status: response.status === 'executed' ? 'success' : 'queued', error: null };
    }
    case 'reminder':
      await createReminder(userId, { text: step.text, remindAt: new Date(Date.now() + step.offsetMinutes * 60_000), source: 'routine' });
      return { label: step.label, status: 'success', error: null };
    case 'notify':
      await sendToUser(userId, { title: routine.name, body: step.text, url: '/panel', tag: `routine-${routine.id}` });
      return { label: step.label, status: 'success', error: null };
    case 'agent': {
      const { conversationId } = await startConversation(userId, step.prompt);
      return { label: step.label, status: 'queued', error: null, openUrl: `/chat/${conversationId}` };
    }
  }
}

/**
 * Exécute toutes les étapes d'une routine, même si l'une échoue, et enregistre le résultat.
 * Statut : `success`, `partial` (au moins une étape en échec) ou `failed` (toutes en échec).
 */
export async function runRoutine(userId: string, routineId: string, trigger: RoutineTrigger, triggerRef: string | null = null): Promise<RoutineRunDto> {
  const routine = await getRoutine(userId, routineId);
  if (!routine.enabled && trigger !== 'manual') throw new AppError('conflict', `La routine « ${routine.name} » est en pause.`);

  const startedAt = Date.now();
  const results: RoutineStepResult[] = [];
  for (const step of routine.steps) {
    const stepStart = Date.now();
    try {
      results.push({ ...await runStep(userId, routine, step), durationMs: Date.now() - stepStart });
    } catch (error) {
      results.push({
        label: step.label,
        status: 'failed',
        durationMs: Date.now() - stepStart,
        error: error instanceof AppError ? error.message : 'Étape impossible',
      });
    }
  }

  const failed = results.filter((result) => result.status === 'failed').length;
  const status: RoutineRunStatus = failed === 0 ? 'success' : failed === results.length ? 'failed' : 'partial';
  const [run] = await db.insert(routineRuns).values({
    userId,
    routineId,
    trigger,
    triggerRef,
    status,
    steps: results,
    durationMs: Date.now() - startedAt,
  }).returning();
  publishToUser(userId, { type: 'activity.created', activityId: run!.id });
  return toRunDto(run!);
}

const ISO_DAY = (day: string) => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[day] ?? 0;

/** Minute locale (« 2026-11-14T07:30 ») et jour ISO de la semaine dans un fuseau. */
export function localMinute(now: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const { day } = localParts(now, timezone);
  return { key: `${day}T${parts.hour}:${parts.minute}`, time: `${parts.hour}:${parts.minute}`, weekday: ISO_DAY(parts.weekday ?? '') };
}

/** Lancé chaque minute : exécute les routines dont c'est l'heure locale, une seule fois par minute. */
export async function runScheduledRoutines(now = new Date()): Promise<number> {
  const candidates = await db.select().from(routines).where(eq(routines.enabled, true));
  let count = 0;
  for (const routine of candidates) {
    if (!routine.schedule) continue;
    const { timezone } = await getSettings(routine.userId);
    const local = localMinute(now, timezone);
    if (routine.schedule.time !== local.time || !routine.schedule.days.includes(local.weekday) || routine.lastScheduledFor === local.key) continue;

    const [claimed] = await db.update(routines).set({ lastScheduledFor: local.key })
      .where(and(eq(routines.id, routine.id), eq(routines.enabled, true)))
      .returning({ id: routines.id });
    if (!claimed) continue;

    const run = await runRoutine(routine.userId, routine.id, 'schedule');
    const done = run.steps.filter((step) => step.status !== 'failed').length;
    await sendToUser(routine.userId, {
      title: routine.name,
      body: run.status === 'success' ? `${done} action${done > 1 ? 's' : ''} effectuée${done > 1 ? 's' : ''}` : `${done}/${run.steps.length} étapes · voir le détail`,
      url: '/routines',
      tag: `routine-${routine.id}`,
    });
    count++;
  }
  return count;
}

export async function listRuns(userId: string, limit = 30) {
  const rows = await db.select({ run: routineRuns, name: routines.name }).from(routineRuns)
    .innerJoin(routines, eq(routines.id, routineRuns.routineId))
    .where(eq(routineRuns.userId, userId)).orderBy(desc(routineRuns.createdAt)).limit(limit);
  return rows.map(({ run, name }) => ({ ...toRunDto(run), routineName: name }));
}

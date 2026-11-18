import type { ActionTrigger, PendingActionStatus, RoutineTrigger } from '@app/shared';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { listActivity } from './activity';
import { listRuns } from './routines';

const { pendingActions, files } = schema;

/** Date d'analyse d'un document (les fichiers analysés avant `processed_at` retombent sur `updated_at`). */
const processedAt = sql<Date>`coalesce(${files.processedAt}, ${files.updatedAt})`.mapWith((value: string | Date) => new Date(value));

export type JournalCategory = 'actions' | 'documents' | 'routines';

export interface JournalEntry {
  id: string;
  category: JournalCategory;
  icon: 'bell' | 'calendar' | 'file' | 'check' | 'ban' | 'hourglass' | 'triangle-exclamation' | 'repeat' | 'nfc' | 'lightbulb' | 'folder';
  title: string;
  detail: string | null;
  status: 'success' | 'failed' | 'refused' | 'expired' | 'undone';
  /** Origine lisible : « Agent », « Validé par vous »… */
  origin: string;
  createdAt: string;
  activityId: string | null;
  undoable: boolean;
}

const ACTIVITY_ICONS: Record<string, JournalEntry['icon']> = {
  'reminder.create': 'bell',
  'google_calendar.create_event': 'calendar',
  'hue.set_room': 'lightbulb',
  'hue.set_light': 'lightbulb',
  'hue.activate_scene': 'lightbulb',
  'drive.move_file': 'folder',
};

/** Origine des actions directes (celles des routines sont regroupées sous leur exécution). */
const ACTIVITY_ORIGINS: Record<Exclude<ActionTrigger, 'routine'>, string> = {
  agent: 'Agent',
  tag: 'Tag NFC',
  panel: 'Vous',
  schedule: 'Vous',
};

const RUN_ORIGINS: Record<RoutineTrigger, string> = {
  manual: 'Vous',
  tag: 'Tag NFC',
  schedule: 'Programmée',
  agent: 'Agent',
};

/**
 * Action soumise à validation, une fois décidée : statut affiché, origine, icône (sinon celle du type d'action).
 * `approved` est l'état transitoire pendant l'exécution : validée, donc jamais affichée comme refusée.
 */
const DECIDED_ACTIONS: Record<Exclude<PendingActionStatus, 'pending'>, { status: JournalEntry['status']; origin: string; icon?: JournalEntry['icon'] }> = {
  approved: { status: 'success', origin: 'Validé par vous' },
  executed: { status: 'success', origin: 'Validé par vous' },
  failed: { status: 'failed', origin: 'Validé par vous', icon: 'triangle-exclamation' },
  rejected: { status: 'refused', origin: 'Refusée par vous', icon: 'ban' },
  expired: { status: 'expired', origin: 'Non validée sous 15 min', icon: 'hourglass' },
};

/**
 * Journal unifié : actions directes, actions validées ou refusées, documents analysés ou en erreur,
 * exécutions de routines. Pagination par date (`before`) : chaque source est lue avant cette date.
 */
export async function listJournal(userId: string, options: { before?: Date; limit?: number } = {}) {
  const limit = Math.min(options.limit ?? 30, 100);
  const before = options.before;

  const [activity, decided, documents, runs] = await Promise.all([
    listActivity(userId, { before, limit }),
    db.select().from(pendingActions).where(and(
      eq(pendingActions.userId, userId),
      ne(pendingActions.status, 'pending'),
      before ? lt(pendingActions.updatedAt, before) : undefined,
    )).orderBy(desc(pendingActions.updatedAt)).limit(limit),
    db.select({ id: files.id, name: files.name, status: files.status, analysis: files.analysis, error: files.error, updatedAt: processedAt })
      .from(files)
      .where(and(eq(files.userId, userId), isNull(files.deletedAt), inArray(files.status, ['ready', 'failed']), before ? lt(processedAt, before) : undefined))
      .orderBy(desc(processedAt)).limit(limit),
    listRuns(userId, { before, limit }),
  ]);

  const entries: JournalEntry[] = [
    ...activity.filter((entry) => entry.trigger !== 'routine').map((entry): JournalEntry => ({
      id: `activity:${entry.id}`,
      category: 'actions',
      icon: entry.status === 'failed' ? 'triangle-exclamation' : ACTIVITY_ICONS[entry.type] ?? 'check',
      title: entry.summary,
      detail: entry.error,
      status: entry.status === 'executed' ? 'success' : entry.status === 'failed' ? 'failed' : 'undone',
      origin: ACTIVITY_ORIGINS[entry.trigger as Exclude<ActionTrigger, 'routine'>],
      createdAt: entry.createdAt,
      activityId: entry.id,
      undoable: entry.undoable,
    })),
    ...decided.map((row): JournalEntry => {
      const outcome = DECIDED_ACTIONS[row.status as Exclude<PendingActionStatus, 'pending'>];
      return {
        id: `action:${row.id}`,
        category: 'actions',
        icon: outcome.icon ?? ACTIVITY_ICONS[row.type] ?? 'check',
        title: row.summary,
        detail: row.error,
        status: outcome.status,
        origin: outcome.origin,
        createdAt: row.updatedAt.toISOString(),
        activityId: null,
        undoable: false,
      };
    }),
    ...documents.map((file): JournalEntry => ({
      id: `file:${file.id}`,
      category: 'documents',
      icon: file.status === 'failed' ? 'triangle-exclamation' : 'file',
      title: `${file.name} ${file.status === 'failed' ? 'non analysé' : 'analysé'}`,
      detail: file.status === 'failed'
        ? file.error
        : file.analysis ? `${file.analysis.keyInfo.dates.length + file.analysis.keyInfo.amounts.length} infos clés · ${file.analysis.suggestedActions.length} suggestions` : null,
      status: file.status === 'failed' ? 'failed' : 'success',
      origin: 'Agent',
      createdAt: file.updatedAt.toISOString(),
      activityId: null,
      undoable: false,
    })),
    ...runs.map((run): JournalEntry => {
      const done = run.steps.filter((step) => step.status !== 'failed').length;
      const failedStep = run.steps.find((step) => step.status === 'failed');
      return {
        id: `routine:${run.id}`,
        category: 'routines',
        icon: run.trigger === 'tag' ? 'nfc' : run.status === 'success' ? 'repeat' : 'triangle-exclamation',
        title: `Routine « ${run.routineName} »`,
        detail: failedStep ? `${done}/${run.steps.length} actions · ${failedStep.label} : ${failedStep.error}` : `${done}/${run.steps.length} actions`,
        status: run.status === 'success' ? 'success' : 'failed',
        origin: RUN_ORIGINS[run.trigger],
        createdAt: run.createdAt,
        activityId: null,
        undoable: false,
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);

  return { entries, hasMore: entries.length === limit };
}

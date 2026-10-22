import { and, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { listActivity } from './activity';
import { listRuns } from './routines';

const { pendingActions, files } = schema;

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

/**
 * Journal unifié : actions directes, actions validées ou refusées, documents analysés ou en erreur.
 * Pagination par date (`before`).
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
    db.select({ id: files.id, name: files.name, status: files.status, analysis: files.analysis, error: files.error, updatedAt: files.updatedAt })
      .from(files)
      .where(and(eq(files.userId, userId), inArray(files.status, ['ready', 'failed']), before ? lt(files.updatedAt, before) : undefined))
      .orderBy(desc(files.updatedAt)).limit(limit),
    listRuns(userId, limit),
  ]);

  const entries: JournalEntry[] = [
    ...activity.filter((entry) => entry.trigger !== 'routine').map((entry): JournalEntry => ({
      id: `activity:${entry.id}`,
      category: 'actions',
      icon: entry.status === 'failed' ? 'triangle-exclamation' : ACTIVITY_ICONS[entry.type] ?? 'check',
      title: entry.summary,
      detail: entry.error,
      status: entry.status === 'executed' ? 'success' : entry.status === 'failed' ? 'failed' : 'undone',
      origin: entry.trigger === 'agent' ? 'Agent' : entry.trigger === 'routine' ? 'Routine' : entry.trigger === 'tag' ? 'Tag NFC' : 'Vous',
      createdAt: entry.createdAt,
      activityId: entry.id,
      undoable: entry.undoable,
    })),
    ...decided.map((row): JournalEntry => {
      const status = row.status === 'executed' ? 'success' : row.status === 'failed' ? 'failed' : row.status === 'expired' ? 'expired' : 'refused';
      return {
        id: `action:${row.id}`,
        category: 'actions',
        icon: status === 'refused' ? 'ban' : status === 'expired' ? 'hourglass' : status === 'failed' ? 'triangle-exclamation' : ACTIVITY_ICONS[row.type] ?? 'check',
        title: row.summary,
        detail: row.error,
        status,
        origin: status === 'refused' ? 'Refusée par vous' : status === 'expired' ? 'Non validée sous 15 min' : 'Validé par vous',
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
    ...runs.filter((run) => !before || new Date(run.createdAt) < before).map((run): JournalEntry => {
      const done = run.steps.filter((step) => step.status !== 'failed').length;
      const failedStep = run.steps.find((step) => step.status === 'failed');
      return {
        id: `routine:${run.id}`,
        category: 'routines',
        icon: run.trigger === 'tag' ? 'nfc' : run.status === 'success' ? 'repeat' : 'triangle-exclamation',
        title: `Routine « ${run.routineName} »`,
        detail: failedStep ? `${done}/${run.steps.length} actions · ${failedStep.label} : ${failedStep.error}` : `${done}/${run.steps.length} actions`,
        status: run.status === 'success' ? 'success' : 'failed',
        origin: run.trigger === 'tag' ? 'Tag NFC' : run.trigger === 'schedule' ? 'Programmée' : run.trigger === 'agent' ? 'Agent' : 'Vous',
        createdAt: run.createdAt,
        activityId: null,
        undoable: false,
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);

  return { entries, hasMore: entries.length === limit };
}

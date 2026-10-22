import { EventEmitter } from 'node:events';
import { taskPayloadSchemas, type TaskPayload, type TaskType } from '@app/shared';
import { getBoss } from '../jobs/boss';
import type { TaskJobData } from '../jobs/queues';

/** Prévient la passerelle des agents qu'une tâche attend, pour l'attribuer sans attendre le prochain cycle. */
export const taskEvents = new EventEmitter<{ enqueued: [TaskType]; cancel: [TaskSubject] }>();

/**
 * Met une tâche en file. Elle reste en attente tant qu'aucun agent compatible n'est connecté.
 * `singletonKey` évite d'empiler deux fois la même tâche (ex. réindexer deux fois un fichier).
 */
export async function enqueueTask<T extends TaskType>(
  type: T,
  userId: string,
  payload: TaskPayload<T>,
  options: { singletonKey?: string } = {},
): Promise<string | null> {
  const data: TaskJobData<TaskPayload<T>> = { userId, payload: taskPayloadSchemas[type].parse(payload) as TaskPayload<T> };
  const boss = await getBoss();
  const jobId = await boss.send(type, data, options.singletonKey ? { singletonKey: options.singletonKey } : {});
  taskEvents.emit('enqueued', type);
  return jobId;
}

/** Ce dont une tâche en cours dépend : si l'utilisateur le supprime, la tâche est annulée. */
export type TaskSubject = { userId: string } & ({ fileId: string } | { conversationId: string } | { all: true });

export function cancelTasksFor(subject: TaskSubject): void {
  taskEvents.emit('cancel', subject);
}

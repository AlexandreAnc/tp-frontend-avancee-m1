import type { TaskType } from '@app/shared';
import type { QueueOptions } from 'pg-boss';

/** Données d'un job pg-boss de tâche agent. `userId` reste côté serveur (il sert à émettre le token). */
export interface TaskJobData<T = unknown> {
  userId: string;
  payload: T;
}

/** Une file pg-boss par type de tâche agent. Le heartbeat est relayé depuis celui des agents. */
export const TASK_QUEUE_OPTIONS: Record<TaskType, QueueOptions> = {
  'chat.reply': {
    expireInSeconds: 10 * 60,
    heartbeatSeconds: 60,
    retryLimit: 2,
    retryDelay: 5,
  },
  'file.index': {
    expireInSeconds: 30 * 60,
    heartbeatSeconds: 60,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  },
};

/** Les tâches interactives passent avant l'indexation. */
export const TASK_DISPATCH_ORDER: readonly TaskType[] = ['chat.reply', 'file.index'];

export const MAINTENANCE_QUEUES = {
  expireActions: 'maintenance.expire-actions',
  /** Toutes les heures : envoie le résumé quotidien aux utilisateurs dont c'est l'heure locale. */
  digest: 'maintenance.digest',
  /** Chaque minute : routines à déclenchement horaire. */
  routines: 'maintenance.routines',
  /** Chaque nuit : corbeille du drive (au-delà de la durée de conservation) et liens de partage expirés. */
  driveCleanup: 'maintenance.drive-cleanup',
} as const;

/** Envoi d'un rappel, planifié à son heure avec `startAfter`. */
export const REMINDER_QUEUE = 'reminders.fire';

export interface ReminderJobData {
  reminderId: string;
  /** Heure prévue au moment de la planification : un rappel modifié depuis ignore l'ancien job. */
  remindAt: string;
}

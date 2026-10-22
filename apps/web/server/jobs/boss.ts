import { TASK_TYPES } from '@app/shared';
import { PgBoss } from 'pg-boss';
import { getEnv } from '../utils/env';
import { MAINTENANCE_QUEUES, REMINDER_QUEUE, TASK_QUEUE_OPTIONS } from './queues';

let starting: Promise<PgBoss> | undefined;

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: getEnv().DATABASE_URL });
  boss.on('error', (error) => console.error('[pg-boss]', error));
  await boss.start();

  for (const type of TASK_TYPES) {
    await ensureQueue(boss, type, TASK_QUEUE_OPTIONS[type]);
  }
  for (const name of Object.values(MAINTENANCE_QUEUES)) {
    await ensureQueue(boss, name, { retryLimit: 0 });
  }
  await ensureQueue(boss, REMINDER_QUEUE, { retryLimit: 3, retryDelay: 30 });
  return boss;
}

async function ensureQueue(boss: PgBoss, name: string, options: Parameters<PgBoss['createQueue']>[1]) {
  if (await boss.getQueue(name)) {
    await boss.updateQueue(name, options);
  } else {
    await boss.createQueue(name, options);
  }
}

/** Instance pg-boss unique du serveur, démarrée à la première utilisation. */
export function getBoss(): Promise<PgBoss> {
  starting ??= startBoss().catch((error: unknown) => {
    starting = undefined;
    throw error;
  });
  return starting;
}

export async function stopBoss(): Promise<void> {
  if (!starting) return;
  const boss = await starting;
  starting = undefined;
  await boss.stop({ graceful: true });
}

import { defineNitroPlugin } from 'nitropack/runtime';
import { startGateway, stopGateway } from '../agent-gateway/gateway';
import { getBoss, stopBoss } from '../jobs/boss';
import { MAINTENANCE_QUEUES, REMINDER_QUEUE, type ReminderJobData } from '../jobs/queues';
import { expireActions } from '../services/actions';
import { runDigests } from '../services/digest';
import { fireReminder } from '../services/reminders';
import { runScheduledRoutines } from '../services/routines';
import { purgeOldTaskTokens } from '../services/task-tokens';

export default defineNitroPlugin((nitroApp) => {
  // Pas de file de tâches pendant `nuxt build` / `nuxt prepare`.
  if (import.meta.prerender) return;

  const ready = (async () => {
    const boss = await getBoss();
    await boss.schedule(MAINTENANCE_QUEUES.expireActions, '* * * * *');
    await boss.work(MAINTENANCE_QUEUES.expireActions, async () => {
      await expireActions();
      await purgeOldTaskTokens();
    });
    await boss.schedule(MAINTENANCE_QUEUES.digest, '0 * * * *');
    await boss.work(MAINTENANCE_QUEUES.digest, async () => {
      await runDigests();
    });
    await boss.schedule(MAINTENANCE_QUEUES.routines, '* * * * *');
    await boss.work(MAINTENANCE_QUEUES.routines, async () => {
      await runScheduledRoutines();
    });
    await boss.work<ReminderJobData>(REMINDER_QUEUE, async (jobs) => {
      for (const job of jobs) await fireReminder(job.data);
    });
    startGateway();
  })().catch((error: unknown) => {
    console.error('[jobs] démarrage impossible', error);
  });

  nitroApp.hooks.hook('close', async () => {
    await ready;
    await stopGateway();
    await stopBoss();
  });
});

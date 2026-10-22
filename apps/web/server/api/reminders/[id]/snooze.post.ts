import { z } from 'zod';
import { snoozeReminder } from '../../../services/reminders';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({ minutes: z.number().int().positive() });

/** Appelée depuis l'app ou par le bouton « +1 h » d'une notification (session du navigateur). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { minutes } = await readValidatedBodyOrThrow(event, bodySchema);
  return { reminder: await snoozeReminder(user.id, getUuidParam(event), minutes) };
});

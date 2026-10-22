import { z } from 'zod';
import { updateReminder } from '../../services/reminders';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({
  text: z.string().trim().min(1).max(300).optional(),
  remindAt: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(['done', 'scheduled']).optional(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const input = await readValidatedBodyOrThrow(event, bodySchema);
  return { reminder: await updateReminder(user.id, getUuidParam(event), input) };
});

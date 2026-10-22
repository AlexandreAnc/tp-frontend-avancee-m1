import { z } from 'zod';
import { listReminders } from '../../services/reminders';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getValidatedQueryOrThrow } from '../../utils/validation';

const querySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { from, to } = getValidatedQueryOrThrow(event, querySchema);
  const range = from && to ? { from: new Date(from), to: new Date(to) } : undefined;
  return { reminders: await listReminders(user.id, range) };
});

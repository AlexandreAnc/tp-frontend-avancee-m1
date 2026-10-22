import { reminderPayloadSchema } from '@app/shared';
import { createReminder } from '../../services/reminders';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const input = await readValidatedBodyOrThrow(event, reminderPayloadSchema);
  return { reminder: await createReminder(user.id, { ...input, source: input.fileId ? 'deadline' : 'user' }) };
});

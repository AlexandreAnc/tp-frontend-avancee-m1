import { cancelReminder } from '../../services/reminders';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await cancelReminder(user.id, getUuidParam(event));
  return { ok: true };
});

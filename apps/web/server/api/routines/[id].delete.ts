import { deleteRoutine } from '../../services/routines';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await deleteRoutine(user.id, getUuidParam(event));
  return { ok: true };
});

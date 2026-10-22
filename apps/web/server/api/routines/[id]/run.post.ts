import { runRoutine } from '../../../services/routines';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { run: await runRoutine(user.id, getUuidParam(event), 'manual') };
});

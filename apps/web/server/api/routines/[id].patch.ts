import { routineInputSchema } from '@app/shared';
import { updateRoutine } from '../../services/routines';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const input = await readValidatedBodyOrThrow(event, routineInputSchema.partial());
  return { routine: await updateRoutine(user.id, getUuidParam(event), input) };
});

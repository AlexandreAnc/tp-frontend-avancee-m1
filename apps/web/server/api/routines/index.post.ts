import { routineInputSchema } from '@app/shared';
import { createRoutine } from '../../services/routines';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { routine: await createRoutine(user.id, await readValidatedBodyOrThrow(event, routineInputSchema)) };
});

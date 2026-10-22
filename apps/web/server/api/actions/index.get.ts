import { PENDING_ACTION_STATUSES } from '@app/shared';
import { z } from 'zod';
import { listActions } from '../../services/actions';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getValidatedQueryOrThrow } from '../../utils/validation';

const querySchema = z.object({ status: z.enum(PENDING_ACTION_STATUSES).optional() });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { status } = getValidatedQueryOrThrow(event, querySchema);
  return { actions: await listActions(user.id, status) };
});

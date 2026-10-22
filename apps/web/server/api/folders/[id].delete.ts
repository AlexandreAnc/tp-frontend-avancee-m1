import { z } from 'zod';
import { deleteFolder } from '../../services/drive';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, getValidatedQueryOrThrow } from '../../utils/validation';

const querySchema = z.object({ mode: z.enum(['keep', 'all']).default('keep') });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { mode } = getValidatedQueryOrThrow(event, querySchema);
  return deleteFolder(user.id, getUuidParam(event), mode);
});

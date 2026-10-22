import { ROUTINE_ICONS } from '@app/shared';
import { z } from 'zod';
import { updateTag } from '../../services/tags';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  icon: z.enum(ROUTINE_ICONS).optional(),
  routineId: z.uuid().nullable().optional(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { tag: await updateTag(user.id, getUuidParam(event), await readValidatedBodyOrThrow(event, bodySchema)) };
});

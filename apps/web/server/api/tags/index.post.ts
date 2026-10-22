import { ROUTINE_ICONS } from '@app/shared';
import { z } from 'zod';
import { createTag } from '../../services/tags';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.enum(ROUTINE_ICONS).default('house'),
  routineId: z.uuid().nullable(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { tag: await createTag(user.id, await readValidatedBodyOrThrow(event, bodySchema)) };
});

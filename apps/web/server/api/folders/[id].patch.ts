import { z } from 'zod';
import { updateFolder } from '../../services/drive';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(), parentId: z.uuid().nullable().optional(),
  starred: z.boolean().optional(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { folder: await updateFolder(user.id, getUuidParam(event), await readValidatedBodyOrThrow(event, bodySchema)) };
});

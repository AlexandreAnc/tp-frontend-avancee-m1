import { z } from 'zod';
import { createFolder } from '../../services/drive';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ name: z.string().min(1).max(120), parentId: z.uuid().nullable() });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { folder: await createFolder(user.id, await readValidatedBodyOrThrow(event, bodySchema)) };
});

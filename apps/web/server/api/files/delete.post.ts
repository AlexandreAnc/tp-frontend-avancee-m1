import { z } from 'zod';
import { trashFiles } from '../../services/trash';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(200) });

/** Mise à la corbeille groupée (sélection multiple du drive). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { fileIds } = await readValidatedBodyOrThrow(event, bodySchema);
  return { trashed: await trashFiles(user.id, fileIds) };
});

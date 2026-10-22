import { z } from 'zod';
import { deleteFile } from '../../services/files';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(200) });

/** Suppression groupée (sélection multiple du drive). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { fileIds } = await readValidatedBodyOrThrow(event, bodySchema);
  for (const fileId of fileIds) await deleteFile(user.id, fileId);
  return { deleted: fileIds.length };
});

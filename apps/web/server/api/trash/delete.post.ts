import { z } from 'zod';
import { deleteForever } from '../../services/trash';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

/** Suppression définitive : les fichiers indiqués, ou toute la corbeille (`all: true`). */
const bodySchema = z.union([
  z.object({ fileIds: z.array(z.uuid()).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readValidatedBodyOrThrow(event, bodySchema);
  return { deleted: await deleteForever(user.id, 'fileIds' in body ? body.fileIds : undefined) };
});

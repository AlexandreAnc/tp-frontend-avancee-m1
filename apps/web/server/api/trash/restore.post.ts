import { z } from 'zod';
import { restoreFiles } from '../../services/trash';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(200) });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { fileIds } = await readValidatedBodyOrThrow(event, bodySchema);
  return { restored: await restoreFiles(user.id, fileIds) };
});

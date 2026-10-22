import { z } from 'zod';
import { moveFiles } from '../../services/drive';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(200), folderId: z.uuid().nullable() });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { fileIds, folderId } = await readValidatedBodyOrThrow(event, bodySchema);
  return { moved: await moveFiles(user.id, fileIds, folderId) };
});

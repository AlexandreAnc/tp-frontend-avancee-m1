import { reindexFile } from '../../../services/files';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { file: await reindexFile(user.id, getUuidParam(event)) };
});

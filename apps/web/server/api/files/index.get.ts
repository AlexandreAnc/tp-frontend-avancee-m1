import { getQuota, listFiles, toFileDto } from '../../services/files';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const [files, quota] = await Promise.all([listFiles(user.id), getQuota(user.id)]);
  return { files: files.map(toFileDto), quota };
});

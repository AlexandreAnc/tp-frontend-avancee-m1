import { TRASH_RETENTION_DAYS } from '@app/shared';
import { getQuota } from '../../services/files';
import { listTrash } from '../../services/trash';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const [files, quota] = await Promise.all([listTrash(user.id), getQuota(user.id)]);
  return { files, quota, retentionDays: TRASH_RETENTION_DAYS, sizeBytes: files.reduce((total, file) => total + file.sizeBytes, 0) };
});

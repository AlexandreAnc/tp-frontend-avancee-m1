import { indexFileRequestSchema } from '@app/shared';
import { saveFileIndex } from '../../../../services/files';
import { defineAppHandler } from '../../../../utils/handler';
import { requireTaskToken } from '../../../../utils/task-auth';
import { getUuidParam, readValidatedBodyOrThrow } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const data = await readValidatedBodyOrThrow(event, indexFileRequestSchema);
  return saveFileIndex(userId, getUuidParam(event), data);
});

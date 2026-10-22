import { readFileQuerySchema } from '@app/shared';
import { readFileText } from '../../../../services/files';
import { defineAppHandler } from '../../../../utils/handler';
import { requireTaskToken } from '../../../../utils/task-auth';
import { getUuidParam, getValidatedQueryOrThrow } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const range = getValidatedQueryOrThrow(event, readFileQuerySchema);
  return readFileText(userId, getUuidParam(event), range);
});

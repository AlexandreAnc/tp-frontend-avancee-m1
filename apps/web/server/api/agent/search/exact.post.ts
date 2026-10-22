import { exactSearchRequestSchema } from '@app/shared';
import { exactSearch } from '../../../services/search';
import { defineAppHandler } from '../../../utils/handler';
import { requireTaskToken } from '../../../utils/task-auth';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  return exactSearch(userId, await readValidatedBodyOrThrow(event, exactSearchRequestSchema));
});

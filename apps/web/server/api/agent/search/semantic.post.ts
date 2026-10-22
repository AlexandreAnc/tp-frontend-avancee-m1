import { semanticSearchRequestSchema } from '@app/shared';
import { semanticSearch } from '../../../services/search';
import { defineAppHandler } from '../../../utils/handler';
import { requireTaskToken } from '../../../utils/task-auth';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  return semanticSearch(userId, await readValidatedBodyOrThrow(event, semanticSearchRequestSchema));
});

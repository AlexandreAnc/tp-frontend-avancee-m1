import { createActionRequestSchema } from '@app/shared';
import { requestAction } from '../../services/actions';
import { defineAppHandler } from '../../utils/handler';
import { requireTaskToken } from '../../utils/task-auth';
import { readValidatedBodyOrThrow } from '../../utils/validation';

/** L'agent ne fait que demander : le serveur exécute selon le niveau de risque (direct, ou après validation). */
export default defineAppHandler(async (event) => {
  const { userId, conversationId } = await requireTaskToken(event);
  const { action, summary } = await readValidatedBodyOrThrow(event, createActionRequestSchema);
  return requestAction(userId, { action, summary, conversationId, trigger: 'agent' });
});

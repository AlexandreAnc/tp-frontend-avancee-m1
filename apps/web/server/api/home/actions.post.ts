import { proposedActionSchema } from '@app/shared';
import { z } from 'zod';
import { riskOf } from '../../connectors/registry';
import { requestAction } from '../../services/actions';
import { AppError } from '../../utils/errors';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ action: proposedActionSchema, summary: z.string().min(1).max(300) });

/** Actions lancées depuis le panel (lampes, scènes) : uniquement les actions sans risque. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { action, summary } = await readValidatedBodyOrThrow(event, bodySchema);
  if (riskOf(action.type) !== 'direct') throw new AppError('forbidden', 'Cette action doit passer par une validation.');
  return requestAction(user.id, { action, summary, conversationId: null, trigger: 'panel' });
});

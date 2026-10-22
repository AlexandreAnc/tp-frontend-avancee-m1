import { actionDecisionSchema } from '@app/shared';
import { decideAction } from '../../../services/actions';
import { AppError } from '../../../utils/errors';
import { defineAppHandler } from '../../../utils/handler';
import { getSessionUser } from '../../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../../utils/validation';

/** Appelée depuis l'app (session) ou depuis le service worker au clic sur un bouton de notification (token). */
export default defineAppHandler(async (event) => {
  const decision = await readValidatedBodyOrThrow(event, actionDecisionSchema);
  const user = await getSessionUser(event);
  if (!user && !decision.token) throw new AppError('unauthorized', 'Vous devez être connecté');
  return { action: await decideAction(getUuidParam(event), decision, user ? { userId: user.id, sessionId: user.sessionId } : null) };
});

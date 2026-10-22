import { sendRedirect } from 'h3';
import { z } from 'zod';
import { connectHue } from '../../../services/hue';
import { AppError } from '../../../utils/errors';
import { defineAppHandler } from '../../../utils/handler';
import { consumeOAuthState } from '../../../utils/oauth-state';
import { requireUser } from '../../../utils/session';
import { getValidatedQueryOrThrow } from '../../../utils/validation';

const querySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

/** Retour du consentement Philips : appairage du pont puis retour sur la page Maison. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const query = getValidatedQueryOrThrow(event, querySchema);
  const validState = consumeOAuthState(event, 'hue', query.state);

  if (query.error || !query.code) return sendRedirect(event, '/maison?status=cancelled');
  if (!validState) throw new AppError('forbidden', 'Requête OAuth invalide, réessayez la connexion');

  try {
    await connectHue(user.id, query.code);
  } catch (error) {
    console.error('[connectors] connexion Hue', error instanceof Error ? error.message : error);
    return sendRedirect(event, '/maison?status=error');
  }
  return sendRedirect(event, '/maison?status=connected');
});

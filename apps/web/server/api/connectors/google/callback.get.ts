import { sendRedirect } from 'h3';
import { z } from 'zod';
import { connectGoogle } from '../../../services/connectors';
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

/** Retour du consentement Google : on revient toujours sur les réglages avec le résultat dans l'URL. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const query = getValidatedQueryOrThrow(event, querySchema);
  const validState = consumeOAuthState(event, 'google', query.state);

  if (query.error || !query.code) {
    return sendRedirect(event, '/settings?connector=google&status=cancelled');
  }
  if (!validState) throw new AppError('forbidden', 'Requête OAuth invalide, réessayez la connexion');

  try {
    await connectGoogle(user.id, query.code);
  } catch (error) {
    console.error('[connectors] connexion Google', error instanceof Error ? error.message : error);
    return sendRedirect(event, '/settings?connector=google&status=error');
  }
  return sendRedirect(event, '/settings?connector=google&status=connected');
});

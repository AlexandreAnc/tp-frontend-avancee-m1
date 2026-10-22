import { sendRedirect } from 'h3';
import { getAuthorizationUrl } from '../../../connectors/google/oauth';
import { defineAppHandler } from '../../../utils/handler';
import { createOAuthState } from '../../../utils/oauth-state';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  await requireUser(event);
  return sendRedirect(event, getAuthorizationUrl(createOAuthState(event, 'google')));
});

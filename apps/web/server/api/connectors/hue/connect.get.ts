import { sendRedirect } from 'h3';
import { getHueAuthorizationUrl } from '../../../connectors/hue/api';
import { defineAppHandler } from '../../../utils/handler';
import { createOAuthState } from '../../../utils/oauth-state';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  await requireUser(event);
  return sendRedirect(event, getHueAuthorizationUrl(createOAuthState(event, 'hue')));
});

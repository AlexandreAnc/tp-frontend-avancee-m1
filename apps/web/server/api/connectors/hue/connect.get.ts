import { sendRedirect } from 'h3';
import { getHueAuthorizationUrl } from '../../../connectors/hue/api';
import { getHueApp } from '../../../services/hue';
import { AppError } from '../../../utils/errors';
import { defineAppHandler } from '../../../utils/handler';
import { createOAuthState } from '../../../utils/oauth-state';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const app = await getHueApp(user.id);
  if (!app) throw new AppError('connector_missing', 'Renseignez d’abord votre application Philips Hue');
  return sendRedirect(event, getHueAuthorizationUrl(app, createOAuthState(event, 'hue')));
});

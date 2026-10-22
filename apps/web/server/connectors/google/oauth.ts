import { google } from 'googleapis';
import { getEnv } from '../../utils/env';
import { AppError } from '../../utils/errors';

export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export const GOOGLE_CALLBACK_PATH = '/api/connectors/google/callback';

export function isGoogleConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function createOAuthClient() {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError('connector_missing', "Le connecteur Google n'est pas configuré sur le serveur");
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    new URL(GOOGLE_CALLBACK_PATH, env.BETTER_AUTH_URL).toString(),
  );
}

export type GoogleOAuthClient = ReturnType<typeof createOAuthClient>;

export function getAuthorizationUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    // Force le consentement pour obtenir un refresh token même lors d'une reconnexion.
    prompt: 'consent',
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

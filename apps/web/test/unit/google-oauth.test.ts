import { describe, expect, it, vi } from 'vitest';

/** `getEnv` est mis en cache : chaque cas recharge les modules avec ses variables d'environnement. */
async function loadOAuth(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../../server/connectors/google/oauth');
}

describe('OAuth Google', () => {
  it("signale un connecteur non configuré sur le serveur", async () => {
    const oauth = await loadOAuth({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
    expect(oauth.isGoogleConfigured()).toBe(false);
    expect(() => oauth.createOAuthClient()).toThrow(expect.objectContaining({ code: 'connector_missing' }));
  });

  it('demande un accès hors ligne limité aux événements, avec le state anti-CSRF', async () => {
    const oauth = await loadOAuth({ GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' });
    expect(oauth.isGoogleConfigured()).toBe(true);
    const url = new URL(oauth.getAuthorizationUrl('state-123'));
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/connectors/google/callback');
  });
});

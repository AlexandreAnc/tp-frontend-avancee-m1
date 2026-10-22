import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { ConnectorProvider } from '../db/schema';
import { createOAuthClient, isGoogleConfigured, type GoogleOAuthClient } from '../connectors/google/oauth';
import { isHueConfigured } from '../connectors/hue/api';
import { decrypt, encrypt } from '../utils/crypto';
import { AppError } from '../utils/errors';

const { connectors } = schema;

export async function listConnectors(userId: string) {
  const rows = await db.select().from(connectors).where(eq(connectors.userId, userId));
  const entry = (provider: ConnectorProvider, label: string, available: boolean) => {
    const row = rows.find((candidate) => candidate.provider === provider);
    return { provider, label, available, connected: Boolean(row), connectedAt: row?.createdAt.toISOString() ?? null };
  };
  return [entry('google', 'Google Agenda', isGoogleConfigured()), entry('hue', 'Philips Hue', isHueConfigured())];
}

export async function hasConnector(userId: string, provider: ConnectorProvider): Promise<boolean> {
  const [row] = await db.select({ id: connectors.id }).from(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.provider, provider)));
  return Boolean(row);
}

export async function connectGoogle(userId: string, code: string): Promise<void> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new AppError('upstream', "Google n'a pas renvoyé de token d'accès");
  await saveGoogleTokens(userId, tokens);
}

interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}

async function saveGoogleTokens(userId: string, tokens: GoogleTokens): Promise<void> {
  if (!tokens.access_token) return;
  const values = {
    accessTokenEnc: encrypt(tokens.access_token),
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? null,
    // Google ne renvoie le refresh token qu'au premier consentement : on garde l'ancien sinon.
    ...(tokens.refresh_token ? { refreshTokenEnc: encrypt(tokens.refresh_token) } : {}),
  };
  await db.insert(connectors).values({ userId, provider: 'google', ...values })
    .onConflictDoUpdate({ target: [connectors.userId, connectors.provider], set: values });
}

/** Client OAuth Google de l'utilisateur. Les tokens rafraîchis sont réenregistrés chiffrés. */
export async function getGoogleClient(userId: string): Promise<GoogleOAuthClient> {
  const [row] = await db.select().from(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.provider, 'google')));
  if (!row) throw new AppError('connector_missing', "Connectez Google Agenda dans les réglages pour valider cette action");

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decrypt(row.accessTokenEnc),
    refresh_token: row.refreshTokenEnc ? decrypt(row.refreshTokenEnc) : undefined,
    expiry_date: row.expiresAt?.getTime(),
  });
  client.on('tokens', (tokens) => {
    saveGoogleTokens(userId, tokens).catch((error: unknown) => console.error('[connectors] sauvegarde des tokens', error));
  });
  return client;
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const [row] = await db.delete(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.provider, 'google')))
    .returning();
  if (!row || !isGoogleConfigured()) return;
  try {
    await createOAuthClient().revokeToken(decrypt(row.refreshTokenEnc ?? row.accessTokenEnc));
  } catch {
    // Token déjà révoqué ou expiré côté Google : la suppression locale suffit.
  }
}

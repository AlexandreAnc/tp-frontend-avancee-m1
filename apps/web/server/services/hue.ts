import type { HomeState } from '@app/shared';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { exchangeHueCode, HUE_CALLBACK_PATH, HueApi, serverHueApp, type HueApp, type HueTokens } from '../connectors/hue/api';
import { createHueMcpServer } from '../connectors/hue/hue-mcp';
import { callMcpTool } from '../connectors/mcp';
import { decrypt, encrypt } from '../utils/crypto';
import { getEnv } from '../utils/env';
import { AppError } from '../utils/errors';

const { connectors, connectorApps } = schema;

/** Application Philips de l'utilisateur, sinon celle du serveur ; `null` si aucune n'est configurée. */
export async function getHueApp(userId: string): Promise<HueApp | null> {
  const [own] = await db.select().from(connectorApps).where(and(eq(connectorApps.userId, userId), eq(connectorApps.provider, 'hue')));
  return own ? { clientId: own.clientId, clientSecret: decrypt(own.clientSecretEnc) } : serverHueApp();
}

async function requireHueApp(userId: string): Promise<HueApp> {
  const app = await getHueApp(userId);
  if (!app) throw new AppError('connector_missing', 'Renseignez votre application Philips Hue dans la page Maison pour connecter vos lampes.');
  return app;
}

/** Configuration Hue affichée à l'utilisateur : jamais le secret. */
export async function getHueAppSettings(userId: string) {
  const [own] = await db.select({ clientId: connectorApps.clientId }).from(connectorApps)
    .where(and(eq(connectorApps.userId, userId), eq(connectorApps.provider, 'hue')));
  return {
    ownClientId: own?.clientId ?? null,
    serverApp: serverHueApp() !== null,
    redirectUri: new URL(HUE_CALLBACK_PATH, getEnv().BETTER_AUTH_URL).toString(),
  };
}

/** Enregistre l'application Philips de l'utilisateur (secret chiffré). Une connexion existante est à refaire avec elle. */
export async function saveHueApp(userId: string, clientId: string, clientSecret: string): Promise<void> {
  const values = { clientId, clientSecretEnc: encrypt(clientSecret), updatedAt: new Date() };
  await db.insert(connectorApps).values({ userId, provider: 'hue', ...values })
    .onConflictDoUpdate({ target: [connectorApps.userId, connectorApps.provider], set: values });
  await disconnectHue(userId);
}

export async function deleteHueApp(userId: string): Promise<void> {
  await db.delete(connectorApps).where(and(eq(connectorApps.userId, userId), eq(connectorApps.provider, 'hue')));
  await disconnectHue(userId);
}

async function saveTokens(userId: string, tokens: HueTokens, applicationKey?: string): Promise<void> {
  const values = {
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    ...(applicationKey ? { metadata: { applicationKeyEnc: encrypt(applicationKey) } } : {}),
  };
  await db.insert(connectors).values({ userId, provider: 'hue', ...values })
    .onConflictDoUpdate({ target: [connectors.userId, connectors.provider], set: values });
}

/** Termine l'OAuth Philips puis appaire le pont (clé d'application conservée chiffrée). */
export async function connectHue(userId: string, code: string): Promise<void> {
  const app = await requireHueApp(userId);
  const tokens = await exchangeHueCode(app, code);
  const applicationKey = await new HueApi(app, tokens, null, async () => {}).linkApplication();
  await saveTokens(userId, tokens, applicationKey);
}

export async function getHueApi(userId: string): Promise<HueApi> {
  const [row] = await db.select().from(connectors).where(and(eq(connectors.userId, userId), eq(connectors.provider, 'hue')));
  if (!row) throw new AppError('connector_missing', 'Connectez Philips Hue dans les réglages pour piloter vos lampes.');
  const applicationKey = row.metadata?.applicationKeyEnc ? decrypt(row.metadata.applicationKeyEnc) : null;
  return new HueApi(
    await requireHueApp(userId),
    { accessToken: decrypt(row.accessTokenEnc), refreshToken: row.refreshTokenEnc ? decrypt(row.refreshTokenEnc) : null, expiresAt: row.expiresAt },
    applicationKey,
    (tokens) => saveTokens(userId, tokens),
  );
}

/** État de la maison, ou maison vide si Hue n'est pas connecté. */
export async function getHome(userId: string): Promise<HomeState> {
  const [row] = await db.select({ id: connectors.id }).from(connectors).where(and(eq(connectors.userId, userId), eq(connectors.provider, 'hue')));
  if (!row) return { connected: false, rooms: [], scenes: [] };
  return await callMcpTool(createHueMcpServer(await getHueApi(userId)), 'get_home', {}) as HomeState;
}

export async function disconnectHue(userId: string): Promise<void> {
  await db.delete(connectors).where(and(eq(connectors.userId, userId), eq(connectors.provider, 'hue')));
}


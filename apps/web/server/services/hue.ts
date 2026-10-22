import type { HomeState } from '@app/shared';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { exchangeHueCode, HueApi, isHueConfigured, type HueTokens } from '../connectors/hue/api';
import { createHueMcpServer } from '../connectors/hue/hue-mcp';
import { callMcpTool } from '../connectors/mcp';
import { decrypt, encrypt } from '../utils/crypto';
import { AppError } from '../utils/errors';

const { connectors } = schema;

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
  const tokens = await exchangeHueCode(code);
  const applicationKey = await new HueApi(tokens, null, async () => {}).linkApplication();
  await saveTokens(userId, tokens, applicationKey);
}

export async function getHueApi(userId: string): Promise<HueApi> {
  const [row] = await db.select().from(connectors).where(and(eq(connectors.userId, userId), eq(connectors.provider, 'hue')));
  if (!row) throw new AppError('connector_missing', 'Connectez Philips Hue dans les réglages pour piloter vos lampes.');
  const applicationKey = row.metadata?.applicationKeyEnc ? decrypt(row.metadata.applicationKeyEnc) : null;
  return new HueApi(
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

export { isHueConfigured };

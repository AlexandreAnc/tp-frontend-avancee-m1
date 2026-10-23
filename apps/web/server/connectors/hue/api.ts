import { getEnv } from '../../utils/env';
import { AppError } from '../../utils/errors';
import { HUE_RESOURCE_TYPES, type HueResources } from './resources';

export interface HueTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Application OAuth Philips (developers.meethue.com) : celle de l'utilisateur, ou celle du serveur par défaut. */
export interface HueApp {
  clientId: string;
  clientSecret: string;
}

/** Application Hue du serveur (variables d'environnement), si l'opérateur en a configuré une. */
export function serverHueApp(): HueApp | null {
  const env = getEnv();
  return env.HUE_CLIENT_ID && env.HUE_CLIENT_SECRET ? { clientId: env.HUE_CLIENT_ID, clientSecret: env.HUE_CLIENT_SECRET } : null;
}

const baseUrl = () => getEnv().HUE_API_URL;

export const HUE_CALLBACK_PATH = '/api/connectors/hue/callback';

export function getHueAuthorizationUrl(app: HueApp, state: string): string {
  const url = new URL('/v2/oauth2/authorize', baseUrl());
  url.search = new URLSearchParams({ client_id: app.clientId, response_type: 'code', state }).toString();
  return url.toString();
}

async function requestTokens(app: HueApp, body: Record<string, string>): Promise<HueTokens> {
  const response = await fetch(new URL('/v2/oauth2/token', baseUrl()), {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new AppError('upstream', `Philips Hue a refusé l'authentification (${response.status})`);
  const tokens = await response.json() as TokenResponse;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
  };
}

export function exchangeHueCode(app: HueApp, code: string): Promise<HueTokens> {
  return requestTokens(app, { grant_type: 'authorization_code', code });
}

/**
 * Client de l'API cloud Hue (CLIP v2 relayé par api.meethue.com) pour un utilisateur.
 * Le token est rafraîchi automatiquement ; `onTokens` permet de le réenregistrer chiffré.
 */
export class HueApi {
  constructor(
    private readonly app: HueApp,
    private tokens: HueTokens,
    private readonly applicationKey: string | null,
    private readonly onTokens: (tokens: HueTokens) => Promise<void>,
  ) {}

  private async accessToken(): Promise<string> {
    const expiresSoon = this.tokens.expiresAt && this.tokens.expiresAt.getTime() - Date.now() < 60_000;
    if (expiresSoon && this.tokens.refreshToken) {
      const previousRefreshToken = this.tokens.refreshToken;
      const next = await requestTokens(this.app, { grant_type: 'refresh_token', refresh_token: previousRefreshToken });
      // Philips ne renvoie pas toujours de nouveau refresh token : on garde l'ancien.
      this.tokens = { ...next, refreshToken: next.refreshToken ?? previousRefreshToken };
      await this.onTokens(this.tokens);
    }
    return this.tokens.accessToken;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${await this.accessToken()}`);
    if (this.applicationKey) headers.set('hue-application-key', this.applicationKey);
    if (init.body) headers.set('content-type', 'application/json');

    const response = await fetch(new URL(path, baseUrl()), { ...init, headers });
    if (response.status === 401) throw new AppError('connector_missing', 'La connexion Philips Hue a expiré : reconnectez-la dans les réglages.');
    if (!response.ok) throw new AppError('upstream', `Votre pont Hue ne répond pas (${response.status}).`);
    return response.json() as Promise<T>;
  }

  /**
   * Appairage distant du pont (équivalent de l'appui sur le bouton) : renvoie la clé
   * d'application à utiliser pour toutes les requêtes CLIP v2.
   */
  async linkApplication(): Promise<string> {
    await this.request('/route/api/0/config', { method: 'PUT', body: JSON.stringify({ linkbutton: true }) });
    const result = await this.request<{ success?: { username: string }; error?: { description: string } }[]>(
      '/route/api',
      { method: 'POST', body: JSON.stringify({ devicetype: 'dashia#server' }) },
    );
    const username = result[0]?.success?.username;
    if (!username) throw new AppError('upstream', `Appairage du pont Hue impossible : ${result[0]?.error?.description ?? 'réponse inattendue'}`);
    return username;
  }

  private async resource<T>(type: string): Promise<T[]> {
    const response = await this.request<{ data: T[]; errors: { description: string }[] }>(`/route/clip/v2/resource/${type}`);
    return response.data;
  }

  async getResources(): Promise<HueResources> {
    const entries = await Promise.all(HUE_RESOURCE_TYPES.map(async (type) => [type, await this.resource(type)] as const));
    return Object.fromEntries(entries) as unknown as HueResources;
  }

  async setGroupedLight(id: string, state: { on?: boolean; brightness?: number }): Promise<void> {
    await this.request(`/route/clip/v2/resource/grouped_light/${id}`, { method: 'PUT', body: JSON.stringify(toHueState(state)) });
  }

  async setLight(id: string, state: { on?: boolean; brightness?: number }): Promise<void> {
    await this.request(`/route/clip/v2/resource/light/${id}`, { method: 'PUT', body: JSON.stringify(toHueState(state)) });
  }

  async recallScene(id: string): Promise<void> {
    await this.request(`/route/clip/v2/resource/scene/${id}`, { method: 'PUT', body: JSON.stringify({ recall: { action: 'active' } }) });
  }
}

export function toHueState(state: { on?: boolean; brightness?: number }) {
  return {
    ...(state.on === undefined ? {} : { on: { on: state.on } }),
    ...(state.brightness === undefined ? {} : { dimming: { brightness: state.brightness } }),
  };
}

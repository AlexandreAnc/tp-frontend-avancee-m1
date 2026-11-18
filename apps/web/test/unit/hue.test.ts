import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeHueCode, getHueAuthorizationUrl, HueApi, toHueState } from '../../server/connectors/hue/api';
import { buildHomeState } from '../../server/connectors/hue/resources';
import { hueResources as resources } from '../fixtures/hue';


describe('buildHomeState', () => {
  it('regroupe les lampes par pièce et expose le groupe de lumières à piloter', () => {
    const home = buildHomeState(resources);
    const salon = home.rooms.find((room) => room.name === 'Salon')!;
    expect(salon).toMatchObject({ id: 'gl-salon', kind: 'room', on: true, brightness: 70, archetype: 'living_room' });
    expect(salon.lights).toEqual([
      { id: 'light-1', name: 'Lampadaire', on: true, brightness: 70, reachable: true },
      { id: 'light-2', name: 'Plafonnier', on: false, brightness: null, reachable: false },
    ]);
    expect(home.rooms.find((room) => room.kind === 'zone')?.lights.map((light) => light.id)).toEqual(['light-1']);
    expect(home.scenes).toEqual([{ id: 'scene-lecture', name: 'Lecture', roomId: 'gl-salon' }]);
  });
});

const APP = { clientId: 'hue-client', clientSecret: 'hue-secret' };

describe('HueApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envoie le token et la clé d'application, et convertit l'état", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ data: [], errors: [] }), { status: 200 });
    }));
    const api = new HueApi(APP, { accessToken: 'token-1', refreshToken: null, expiresAt: null }, 'app-key', async () => {});

    await api.setGroupedLight('gl-salon', { on: false });
    expect(calls[0]!.url).toBe('https://api.meethue.com/route/clip/v2/resource/grouped_light/gl-salon');
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('authorization')).toBe('Bearer token-1');
    expect(headers.get('hue-application-key')).toBe('app-key');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ on: { on: false } });
    expect(toHueState({ brightness: 40 })).toEqual({ dimming: { brightness: 40 } });
  });

  it('appaire le pont à distance et récupère la clé', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(
      JSON.stringify(String(url).endsWith('/route/api') ? [{ success: { username: 'cle-pont' } }] : [{ success: {} }]),
      { status: 200 },
    )));
    await expect(new HueApi(APP, { accessToken: 't', refreshToken: null, expiresAt: null }, null, async () => {}).linkApplication()).resolves.toBe('cle-pont');
  });

  it("rafraîchit un token sur le point d'expirer et garde l'ancien refresh token", async () => {
    const saved: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(
      String(url).includes('oauth2/token')
        ? JSON.stringify({ access_token: 'token-2', expires_in: 3600 })
        : JSON.stringify({ data: [], errors: [] }),
      { status: 200 },
    )));
    const api = new HueApi(APP, { accessToken: 'token-1', refreshToken: 'refresh-1', expiresAt: new Date(Date.now() + 1000) }, 'k', async (tokens) => void saved.push(tokens));
    await api.recallScene('scene-lecture');
    expect(saved).toEqual([expect.objectContaining({ accessToken: 'token-2', refreshToken: 'refresh-1' })]);
  });

  it("construit l'URL de consentement Philips avec le state anti-CSRF", () => {
    const url = new URL(getHueAuthorizationUrl(APP, 'state-1'));
    expect(url.origin + url.pathname).toBe('https://api.meethue.com/v2/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: 'hue-client', response_type: 'code', state: 'state-1' });
  });

  it('distingue une connexion expirée (à refaire) d’un pont injoignable', async () => {
    const api = new HueApi(APP, { accessToken: 't', refreshToken: null, expiresAt: null }, 'k', async () => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(api.setLight('light-1', { on: true })).rejects.toMatchObject({ code: 'connector_missing' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(api.setLight('light-1', { on: true })).rejects.toMatchObject({ code: 'upstream', message: expect.stringContaining('503') });
  });

  it("signale un appairage refusé par le pont et un OAuth refusé", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(
      JSON.stringify(String(url).endsWith('/route/api') ? [{ error: { description: 'link button not pressed' } }] : [{ success: {} }]),
      { status: 200 },
    )));
    const api = new HueApi(APP, { accessToken: 't', refreshToken: null, expiresAt: null }, null, async () => {});
    await expect(api.linkApplication()).rejects.toMatchObject({ code: 'upstream', message: expect.stringContaining('link button not pressed') });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    await expect(exchangeHueCode(APP, 'code')).rejects.toMatchObject({ code: 'upstream' });
  });
});

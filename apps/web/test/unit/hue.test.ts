import { afterEach, describe, expect, it, vi } from 'vitest';
import { HueApi, toHueState } from '../../server/connectors/hue/api';
import { buildHomeState, type HueResources } from '../../server/connectors/hue/resources';

const resources: HueResources = {
  room: [{ id: 'room-salon', metadata: { name: 'Salon', archetype: 'living_room' }, children: [{ rid: 'dev-1', rtype: 'device' }, { rid: 'dev-2', rtype: 'device' }], services: [{ rid: 'gl-salon', rtype: 'grouped_light' }] }],
  zone: [{ id: 'zone-bas', metadata: { name: 'Rez-de-chaussée' }, children: [{ rid: 'light-1', rtype: 'light' }], services: [{ rid: 'gl-bas', rtype: 'grouped_light' }] }],
  device: [
    { id: 'dev-1', metadata: { name: 'Lampadaire' }, services: [{ rid: 'light-1', rtype: 'light' }] },
    { id: 'dev-2', metadata: { name: 'Plafonnier' }, services: [{ rid: 'light-2', rtype: 'light' }] },
  ],
  light: [
    { id: 'light-1', owner: { rid: 'dev-1', rtype: 'device' }, metadata: { name: 'Lampadaire' }, on: { on: true }, dimming: { brightness: 69.8 } },
    { id: 'light-2', owner: { rid: 'dev-2', rtype: 'device' }, on: { on: false } },
  ],
  grouped_light: [{ id: 'gl-salon', on: { on: true }, dimming: { brightness: 70.2 } }, { id: 'gl-bas', on: { on: true } }],
  scene: [{ id: 'scene-lecture', metadata: { name: 'Lecture' }, group: { rid: 'room-salon', rtype: 'room' } }],
  zigbee_connectivity: [{ id: 'z-2', owner: { rid: 'dev-2', rtype: 'device' }, status: 'connectivity_issue' }],
};

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
});

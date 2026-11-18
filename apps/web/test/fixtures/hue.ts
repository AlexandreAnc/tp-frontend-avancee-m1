import type { HueResources } from '../../server/connectors/hue/resources';

/** Maison Hue de test : un salon (deux lampes, dont une injoignable), une zone et une scène. */
export const hueResources: HueResources = {
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

export interface HueCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Faux cloud Philips Hue (à passer à `vi.stubGlobal('fetch', …)`) : OAuth, appairage du pont,
 * lecture des ressources CLIP v2 et commandes. Chaque requête est enregistrée dans `calls`.
 */
export function fakeHueCloud(calls: HueCall[], resources: HueResources = hueResources) {
  return async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (url.pathname === '/v2/oauth2/token') return json({ access_token: 'hue-access', refresh_token: 'hue-refresh', expires_in: 3600 });
    if (url.pathname === '/route/api') return json([{ success: { username: 'cle-pont' } }]);
    const type = /^\/route\/clip\/v2\/resource\/([a-z_]+)$/.exec(url.pathname)?.[1];
    if (method === 'GET' && type) return json({ data: resources[type as keyof HueResources] ?? [], errors: [] });
    return json({ data: [], errors: [] });
  };
}

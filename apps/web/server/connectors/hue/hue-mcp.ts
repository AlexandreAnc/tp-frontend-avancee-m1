import { hueLightPayloadSchema, hueRoomPayloadSchema, hueScenePayloadSchema } from '@app/shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HueApi } from './api';
import { buildHomeState } from './resources';

/** État avant une action, pour pouvoir l'annuler depuis le journal. */
export interface LightSnapshot {
  kind: 'grouped_light' | 'light';
  id: string;
  on: boolean;
  brightness: number | null;
}

const snapshotSchema = z.object({
  previous: z.array(z.object({
    kind: z.enum(['grouped_light', 'light']),
    id: z.string(),
    on: z.boolean(),
    brightness: z.number().nullable(),
  })),
});

function structured<T extends object>(result: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result as Record<string, unknown> };
}

/** Serveur MCP Philips Hue d'un utilisateur : lecture de la maison et pilotage des lumières. */
export function createHueMcpServer(api: HueApi): McpServer {
  const server = new McpServer({ name: 'philips-hue', version: '1.0.0' });

  const home = async () => buildHomeState(await api.getResources());

  server.registerTool('get_home', { description: 'Pièces, lampes et scènes de la maison' }, async () => structured(await home()));

  server.registerTool('set_room', {
    description: "Allume, éteint ou règle une pièce, ou toute la maison avec roomId « all »",
    inputSchema: hueRoomPayloadSchema,
  }, async ({ roomId, on, brightness }) => {
    const state = await home();
    const rooms = roomId === 'all' ? state.rooms.filter((room) => room.kind === 'room') : state.rooms.filter((room) => room.id === roomId);
    if (rooms.length === 0) return { isError: true, content: [{ type: 'text' as const, text: 'Pièce inconnue' }] };
    const previous: LightSnapshot[] = rooms.map((room) => ({ kind: 'grouped_light', id: room.id, on: room.on, brightness: room.brightness }));
    for (const room of rooms) await api.setGroupedLight(room.id, { on: on ?? (brightness ? true : undefined), brightness });
    return structured({ previous });
  });

  server.registerTool('set_light', {
    description: "Allume, éteint ou règle une lampe",
    inputSchema: hueLightPayloadSchema,
  }, async ({ lightId, on, brightness }) => {
    const light = (await home()).rooms.flatMap((room) => room.lights).find((candidate) => candidate.id === lightId);
    if (!light) return { isError: true, content: [{ type: 'text' as const, text: 'Lampe inconnue' }] };
    await api.setLight(lightId, { on: on ?? (brightness ? true : undefined), brightness });
    return structured({ previous: [{ kind: 'light', id: light.id, on: light.on, brightness: light.brightness }] });
  });

  server.registerTool('activate_scene', {
    description: 'Active une scène',
    inputSchema: hueScenePayloadSchema,
  }, async ({ sceneId }) => {
    const state = await home();
    const scene = state.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return { isError: true, content: [{ type: 'text' as const, text: 'Scène inconnue' }] };
    const room = state.rooms.find((candidate) => candidate.id === scene.roomId);
    await api.recallScene(sceneId);
    return structured({ previous: room ? [{ kind: 'grouped_light', id: room.id, on: room.on, brightness: room.brightness }] : [] });
  });

  server.registerTool('restore', {
    description: "Rétablit l'état des lumières avant une action",
    inputSchema: snapshotSchema,
  }, async ({ previous }) => {
    for (const snapshot of previous) {
      const state = { on: snapshot.on, brightness: snapshot.on && snapshot.brightness ? snapshot.brightness : undefined };
      if (snapshot.kind === 'grouped_light') await api.setGroupedLight(snapshot.id, state);
      else await api.setLight(snapshot.id, state);
    }
    return structured({ restored: previous.length });
  });

  return server;
}

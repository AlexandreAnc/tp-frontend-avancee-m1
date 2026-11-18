import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createGoogleCalendarMcpServer } from '../../server/connectors/google/calendar-mcp';
import type { GoogleOAuthClient } from '../../server/connectors/google/oauth';
import type { HueApi } from '../../server/connectors/hue/api';
import { createHueMcpServer } from '../../server/connectors/hue/hue-mcp';
import { callMcpTool, errorResult, structuredResult } from '../../server/connectors/mcp';
import { hueResources } from '../fixtures/hue';

const calendar = { events: { insert: vi.fn(), list: vi.fn() } };
vi.mock('googleapis', () => ({ google: { calendar: () => calendar } }));

describe('callMcpTool', () => {
  function echoServer() {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    server.registerTool('echo', { inputSchema: z.object({ value: z.string() }) }, async ({ value }) =>
      value === 'boom' ? errorResult('panne') : structuredResult({ value }));
    server.registerTool('silent', {}, async () => ({ content: [] }));
    return server;
  }

  it('renvoie le résultat structuré de l’outil', async () => {
    await expect(callMcpTool(echoServer(), 'echo', { value: 'ok' })).resolves.toEqual({ value: 'ok' });
    await expect(callMcpTool(echoServer(), 'silent', {})).resolves.toBeNull();
  });

  it('traduit un échec de l’outil en erreur « upstream » lisible', async () => {
    await expect(callMcpTool(echoServer(), 'echo', { value: 'boom' }))
      .rejects.toMatchObject({ code: 'upstream', message: 'Le connecteur a échoué : panne' });
  });

  it('refuse des arguments invalides', async () => {
    await expect(callMcpTool(echoServer(), 'echo', { value: 42 })).rejects.toMatchObject({ code: 'upstream' });
  });
});

describe('serveur MCP Philips Hue', () => {
  let api: { [K in 'getResources' | 'setGroupedLight' | 'setLight' | 'recallScene']: ReturnType<typeof vi.fn> };
  const call = (tool: string, args: Record<string, unknown> = {}) => callMcpTool(createHueMcpServer(api as unknown as HueApi), tool, args);

  beforeEach(() => {
    api = { getResources: vi.fn(async () => hueResources), setGroupedLight: vi.fn(), setLight: vi.fn(), recallScene: vi.fn() };
  });

  it('décrit la maison', async () => {
    const home = await call('get_home') as { rooms: { name: string }[]; scenes: unknown[] };
    expect(home.rooms.map((room) => room.name)).toEqual(['Salon', 'Rez-de-chaussée']);
    expect(home.scenes).toHaveLength(1);
  });

  it('règle une pièce et renvoie son état précédent pour pouvoir annuler', async () => {
    const result = await call('set_room', { roomId: 'gl-salon', brightness: 30 });
    expect(api.setGroupedLight).toHaveBeenCalledWith('gl-salon', { on: true, brightness: 30 });
    expect(result).toEqual({ previous: [{ kind: 'grouped_light', id: 'gl-salon', on: true, brightness: 70 }] });
  });

  it('« all » ne pilote que les pièces, pas les zones (sinon une lampe serait commandée deux fois)', async () => {
    await call('set_room', { roomId: 'all', on: false });
    expect(api.setGroupedLight.mock.calls).toEqual([['gl-salon', { on: false, brightness: undefined }]]);
  });

  it('refuse une pièce, une lampe ou une scène inconnue sans rien piloter', async () => {
    await expect(call('set_room', { roomId: 'gl-inconnu', on: true })).rejects.toThrow('Pièce inconnue');
    await expect(call('set_light', { lightId: 'light-x', on: true })).rejects.toThrow('Lampe inconnue');
    await expect(call('activate_scene', { sceneId: 'scene-x' })).rejects.toThrow('Scène inconnue');
    expect(api.setGroupedLight).not.toHaveBeenCalled();
    expect(api.setLight).not.toHaveBeenCalled();
    expect(api.recallScene).not.toHaveBeenCalled();
  });

  it('éteindre une lampe ne force pas sa luminosité', async () => {
    const result = await call('set_light', { lightId: 'light-1', on: false });
    expect(api.setLight).toHaveBeenCalledWith('light-1', { on: false, brightness: undefined });
    expect(result).toEqual({ previous: [{ kind: 'light', id: 'light-1', on: true, brightness: 70 }] });
  });

  it('active une scène et mémorise l’état de sa pièce', async () => {
    const result = await call('activate_scene', { sceneId: 'scene-lecture' });
    expect(api.recallScene).toHaveBeenCalledWith('scene-lecture');
    expect(result).toEqual({ previous: [{ kind: 'grouped_light', id: 'gl-salon', on: true, brightness: 70 }] });
  });

  it('rétablit l’état précédent (sans luminosité pour une lumière éteinte)', async () => {
    const result = await call('restore', {
      previous: [
        { kind: 'grouped_light', id: 'gl-salon', on: true, brightness: 70 },
        { kind: 'light', id: 'light-2', on: false, brightness: 40 },
      ],
    });
    expect(result).toEqual({ restored: 2 });
    expect(api.setGroupedLight).toHaveBeenCalledWith('gl-salon', { on: true, brightness: 70 });
    expect(api.setLight).toHaveBeenCalledWith('light-2', { on: false, brightness: undefined });
  });
});

describe('serveur MCP Google Agenda', () => {
  const call = (tool: string, args: Record<string, unknown>) => callMcpTool(createGoogleCalendarMcpServer({} as GoogleOAuthClient), tool, args);

  it("crée l'événement dans l'agenda principal", async () => {
    calendar.events.insert.mockResolvedValue({ data: { id: 'evt-1', htmlLink: 'https://calendar.google.com/evt-1' } });
    const event = { title: 'Plombier', start: '2026-11-20T09:00:00+01:00', end: '2026-11-20T10:00:00+01:00', location: 'Maison' };
    await expect(call('create_event', event)).resolves.toEqual({ eventId: 'evt-1', htmlLink: 'https://calendar.google.com/evt-1' });
    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: 'primary',
      requestBody: { summary: 'Plombier', description: undefined, location: 'Maison', start: { dateTime: event.start }, end: { dateTime: event.end } },
    });
  });

  it('refuse un événement qui finit avant de commencer', async () => {
    calendar.events.insert.mockClear();
    await expect(call('create_event', { title: 'x', start: '2026-11-20T10:00:00+01:00', end: '2026-11-20T09:00:00+01:00' })).rejects.toMatchObject({ code: 'upstream' });
    expect(calendar.events.insert).not.toHaveBeenCalled();
  });

  it('liste les événements, journées entières et sans titre compris', async () => {
    calendar.events.list.mockResolvedValue({
      data: {
        items: [
          { id: 'a', summary: 'Réunion', start: { dateTime: '2026-11-20T09:00:00+01:00' }, end: { dateTime: '2026-11-20T10:00:00+01:00' }, location: 'Bureau', htmlLink: 'https://x' },
          { start: { date: '2026-11-21' }, end: { date: '2026-11-22' } },
        ],
      },
    });
    const range = { timeMin: '2026-11-20T00:00:00+01:00', timeMax: '2026-11-27T00:00:00+01:00' };
    const { events } = await call('list_events', range) as { events: unknown[] };
    expect(events).toEqual([
      { id: 'a', title: 'Réunion', start: '2026-11-20T09:00:00+01:00', end: '2026-11-20T10:00:00+01:00', allDay: false, location: 'Bureau', link: 'https://x' },
      { id: '', title: '(sans titre)', start: '2026-11-21', end: '2026-11-22', allDay: true, location: null, link: null },
    ]);
    expect(calendar.events.list).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'primary', singleEvents: true, ...range }));
  });

  it('gère un agenda vide', async () => {
    calendar.events.list.mockResolvedValue({ data: {} });
    await expect(call('list_events', { timeMin: '2026-11-20T00:00:00Z', timeMax: '2026-11-21T00:00:00Z' })).resolves.toEqual({ events: [] });
  });
});

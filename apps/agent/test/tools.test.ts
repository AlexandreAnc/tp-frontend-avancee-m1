import { describe, expect, it, vi } from 'vitest';
import { runTool, toOllamaTools } from '../src/tools';
import { fakeContext, fakeLlm } from './fakes';

const FILE_ID = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';

describe('toOllamaTools', () => {
  it('expose tous les outils partagés avec un schéma JSON', () => {
    const tools = toOllamaTools();
    expect(tools.map((tool) => tool.function.name)).toEqual([
      'list_files', 'move_file', 'read_file', 'semantic_search', 'exact_search', 'create_calendar_event', 'create_reminder',
      'get_home', 'control_lights', 'activate_scene', 'list_routines', 'run_routine', 'get_agenda',
    ]);
    expect(tools.find((tool) => tool.function.name === 'read_file')!.function.parameters?.required).toEqual(['fileId']);
    expect(tools.find((tool) => tool.function.name === 'move_file')!.function.parameters?.required).toEqual(['fileId', 'folderPath']);
  });
});

describe('runTool', () => {
  it('refuse un outil inconnu ou des arguments invalides sans appeler l’API', async () => {
    const readFile = vi.fn();
    const context = fakeContext({ readFile }, fakeLlm([]).llm);
    expect(await runTool('rm_rf', {}, context)).toEqual({ ok: false, error: 'Outil inconnu : rm_rf' });
    const invalid = await runTool('read_file', { fileId: 'pas-un-uuid' }, context);
    expect(invalid.ok).toBe(false);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('semantic_search calcule l’embedding de la requête avec le modèle partagé', async () => {
    const semanticSearch = vi.fn(async () => ({ results: [] }));
    const { llm, embed } = fakeLlm([]);
    const result = await runTool('semantic_search', { query: 'facture plombier' }, fakeContext({ semanticSearch }, llm));
    expect(result).toEqual({ ok: true, output: { results: [] } });
    expect(embed).toHaveBeenCalledWith(['facture plombier']);
    expect(semanticSearch).toHaveBeenCalledWith(expect.objectContaining({ embedModel: 'bge-m3', limit: 5 }));
  });

  it('create_calendar_event propose une action avec le bon décalage horaire', async () => {
    const requestAction = vi.fn(async () => ({ actionId: FILE_ID, status: 'pending' as const, expiresAt: new Date().toISOString() }));
    await runTool('create_calendar_event', {
      title: 'Payer le plombier',
      start: '2026-11-14T09:00',
      end: '2026-11-14T10:00',
    }, fakeContext({ requestAction }, fakeLlm([]).llm));

    expect(requestAction).toHaveBeenCalledWith(
      {
        type: 'google_calendar.create_event',
        payload: { title: 'Payer le plombier', start: '2026-11-14T09:00:00+01:00', end: '2026-11-14T10:00:00+01:00' },
      },
      expect.stringContaining('14 novembre 2026 à 09:00'),
    );
  });

  it('create_calendar_event refuse une fin avant le début', async () => {
    const requestAction = vi.fn();
    await expect(runTool('create_calendar_event', {
      title: 'Test', start: '2026-11-14T10:00', end: '2026-11-14T09:00',
    }, fakeContext({ requestAction }, fakeLlm([]).llm))).rejects.toThrow('postérieure');
    expect(requestAction).not.toHaveBeenCalled();
  });

  it('create_reminder demande un rappel direct, à la bonne heure locale', async () => {
    const requestAction = vi.fn(async () => ({ status: 'executed' as const, activityId: FILE_ID, result: { reminderId: FILE_ID } }));
    const result = await runTool('create_reminder', { text: 'Payer EDF', at: '2026-11-02T09:00' }, fakeContext({ requestAction }, fakeLlm([]).llm));
    expect(result).toMatchObject({ ok: true, output: { status: 'executed' } });
    expect(requestAction).toHaveBeenCalledWith(
      { type: 'reminder.create', payload: { text: 'Payer EDF', remindAt: '2026-11-02T09:00:00+01:00' } },
      expect.stringContaining('2 novembre 2026 à 09:00'),
    );
  });

  it('get_agenda couvre des jours entiers dans le fuseau de l’utilisateur', async () => {
    const getAgenda = vi.fn(async () => ({ items: [], calendarConnected: false }));
    await runTool('get_agenda', { from: '2026-10-24', to: '2026-10-26' }, fakeContext({ getAgenda }, fakeLlm([]).llm));
    // Changement d'heure le 25 octobre : +02:00 au début, +01:00 à la fin.
    expect(getAgenda).toHaveBeenCalledWith({ from: '2026-10-24T00:00:00+02:00', to: '2026-10-27T00:00:00+01:00' });
  });

  it('control_lights demande une action Hue directe avec un résumé lisible', async () => {
    const getHome = vi.fn(async () => ({ connected: true, rooms: [{ id: 'gl-salon', name: 'Salon', kind: 'room' as const, archetype: null, on: true, brightness: 70, lights: [] }], scenes: [] }));
    const requestAction = vi.fn(async () => ({ status: 'executed' as const, activityId: FILE_ID, result: {} }));
    await runTool('control_lights', { roomId: 'gl-salon', on: false }, fakeContext({ getHome, requestAction }, fakeLlm([]).llm));
    expect(requestAction).toHaveBeenCalledWith({ type: 'hue.set_room', payload: { roomId: 'gl-salon', on: false } }, 'Éteindre Salon');
  });
});

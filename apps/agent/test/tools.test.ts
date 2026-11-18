import { describe, expect, it, vi } from 'vitest';
import { isToolName, runTool, toOllamaTools } from '../src/tools';
import { TaskError } from '../src/tasks/errors';
import { fakeContext, fakeLlm } from './fakes';

const FILE_ID = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';
const executed = { status: 'executed' as const, activityId: FILE_ID, result: {} };
const home = {
  connected: true,
  rooms: [{ id: 'gl-salon', name: 'Salon', kind: 'room' as const, archetype: null, on: true, brightness: 70, lights: [] }],
  scenes: [{ id: 'sc-cinema', name: 'Cinéma', roomId: 'gl-salon' }],
};

describe('isToolName', () => {
  it('reconnaît les outils partagés et rien d’autre', () => {
    expect(isToolName('read_file')).toBe(true);
    expect(isToolName('ask_documents')).toBe(false);
  });
});

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

  it('create_reminder renvoie au modèle une erreur corrigible pour un texte vide', async () => {
    const requestAction = vi.fn();
    const error = await runTool('create_reminder', { text: '   ', at: '2026-11-02T09:00' }, fakeContext({ requestAction }, fakeLlm([]).llm)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskError);
    expect(error).toMatchObject({ retryable: false, fatal: false });
    expect(requestAction).not.toHaveBeenCalled();
  });

  it('create_reminder garde le document à l’origine du rappel', async () => {
    const requestAction = vi.fn(async () => executed);
    await runTool('create_reminder', { text: 'Payer', at: '2026-11-02T09:00', fileId: FILE_ID }, fakeContext({ requestAction }, fakeLlm([]).llm));
    expect(requestAction).toHaveBeenCalledWith({ type: 'reminder.create', payload: expect.objectContaining({ fileId: FILE_ID }) }, expect.any(String));
  });

  it.each([
    [{ roomId: 'all', on: false }, 'Éteindre toute la maison'],
    [{ roomId: 'gl-salon', brightness: 30 }, 'Régler à 30 % Salon'],
    [{ roomId: 'gl-salon', on: true }, 'Allumer Salon'],
    [{ roomId: 'inconnue', on: true }, 'Allumer la pièce'],
  ])('control_lights résume l’action %o', async (input, summary) => {
    const requestAction = vi.fn(async () => executed);
    await runTool('control_lights', input, fakeContext({ getHome: async () => home, requestAction }, fakeLlm([]).llm));
    expect(requestAction).toHaveBeenCalledWith({ type: 'hue.set_room', payload: expect.objectContaining({ roomId: input.roomId }) }, summary);
  });

  it('control_lights sur toute la maison ne consulte pas l’état des pièces', async () => {
    const getHome = vi.fn();
    await runTool('control_lights', { roomId: 'all', on: true }, fakeContext({ getHome, requestAction: async () => executed }, fakeLlm([]).llm));
    expect(getHome).not.toHaveBeenCalled();
  });

  it('activate_scene nomme la scène dans le résumé quand elle existe', async () => {
    const requestAction = vi.fn(async () => executed);
    const context = fakeContext({ getHome: async () => home, requestAction }, fakeLlm([]).llm);
    await runTool('activate_scene', { sceneId: 'sc-cinema' }, context);
    await runTool('activate_scene', { sceneId: 'sc-disparue' }, context);
    expect(requestAction.mock.calls.map((args) => (args as unknown[])[1])).toEqual(['Scène « Cinéma »', 'Scène « Hue »']);
    expect(requestAction).toHaveBeenCalledWith({ type: 'hue.activate_scene', payload: { sceneId: 'sc-cinema' } }, expect.any(String));
  });

  it('move_file nomme le fichier et la racine du drive', async () => {
    const requestAction = vi.fn(async () => executed);
    const listFiles = async () => ({ files: [{ id: FILE_ID, name: 'bail.pdf', mimeType: 'application/pdf', sizeBytes: 1, status: 'ready' as const, documentType: null, summary: null, path: '', createdAt: '' }] });
    const context = fakeContext({ listFiles, requestAction }, fakeLlm([]).llm);
    await runTool('move_file', { fileId: FILE_ID, folderPath: 'Logement/2026' }, context);
    await runTool('move_file', { fileId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', folderPath: '  ' }, context);
    expect(requestAction.mock.calls.map((args) => (args as unknown[])[1])).toEqual([
      'Ranger « bail.pdf » dans Logement/2026',
      'Ranger « le fichier » dans la racine du drive',
    ]);
  });

  it.each([
    ['list_files', {}, 'listFiles', [], { files: [] }],
    ['read_file', { fileId: FILE_ID, offset: 100 }, 'readFile', [FILE_ID, 100], { fileId: FILE_ID, name: 'a', text: 't', offset: 100, totalLength: 200 }],
    ['exact_search', { query: 'EDF' }, 'exactSearch', [{ query: 'EDF', limit: 10 }], { results: [] }],
    ['get_home', {}, 'getHome', [], home],
    ['list_routines', {}, 'listRoutines', [], { routines: [] }],
    ['run_routine', { routineId: FILE_ID }, 'runRoutine', [FILE_ID], { status: 'success', steps: [] }],
  ] as const)('%s transmet l’appel à l’API et renvoie sa réponse', async (name, input, method, args, output) => {
    const apiMethod = vi.fn(async () => output);
    await expect(runTool(name, input, fakeContext({ [method]: apiMethod }, fakeLlm([]).llm))).resolves.toEqual({ ok: true, output });
    expect(apiMethod).toHaveBeenCalledWith(...args);
  });

  it('semantic_search respecte la limite demandée', async () => {
    const semanticSearch = vi.fn(async () => ({ results: [] }));
    await runTool('semantic_search', { query: 'bail', limit: 12 }, fakeContext({ semanticSearch }, fakeLlm([]).llm));
    expect(semanticSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 12 }));
  });

  it('refuse un outil réservé à un autre spécialiste', async () => {
    const getHome = vi.fn();
    expect(await runTool('get_home', {}, fakeContext({ getHome }, fakeLlm([]).llm), ['list_files'])).toEqual({ ok: false, error: 'Outil inconnu : get_home' });
    expect(getHome).not.toHaveBeenCalled();
  });

  it('refuse une sortie d’outil qui ne respecte pas le schéma partagé', async () => {
    const context = fakeContext({ listFiles: async () => ({ files: 'aucun' }) }, fakeLlm([]).llm);
    await expect(runTool('list_files', {}, context)).rejects.toThrow();
  });
});

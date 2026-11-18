import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/api/client';

const FILE_ID = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';

function client(reply: (url: string, init: RequestInit) => Response | Promise<Response>, signal = new AbortController().signal) {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => reply(String(url), init ?? {}));
  return { api: new ApiClient('https://dashia.test', 'task-token', signal), fetchMock };
}

const sentBody = (fetchMock: ReturnType<typeof client>['fetchMock']) => JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as unknown;

afterEach(() => vi.restoreAllMocks());

describe('ApiClient', () => {
  it('appelle l’API agent avec le token de la tâche', async () => {
    const { api, fetchMock } = client(() => Response.json({ files: [] }));
    await api.listFiles();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://dashia.test/api/agent/files');
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer task-token');
  });

  it('refuse une réponse qui ne respecte pas le schéma partagé', async () => {
    const { api } = client(() => Response.json({ fileId: FILE_ID, text: 42 }));
    await expect(api.readFile(FILE_ID)).rejects.toMatchObject({ message: expect.stringContaining('Réponse inattendue'), retryable: false });
  });

  it.each([
    [401, { retryable: false, fatal: true }],
    [403, { retryable: false, fatal: true }],
    [404, { retryable: false, fatal: false }],
    [413, { retryable: false, fatal: false }],
    [503, { retryable: true, fatal: true }],
  ])('classe une réponse %i (réessayer ? arrêter la tâche ?)', async (status, expected) => {
    const { api } = client(() => Response.json({ message: 'refusé' }, { status }));
    await expect(api.getHome()).rejects.toMatchObject({ ...expected, message: expect.stringContaining(`${status} refusé`) });
  });

  it('rend réessayable un serveur injoignable', async () => {
    const { api } = client(() => { throw new TypeError('fetch failed'); });
    await expect(api.getHome()).rejects.toMatchObject({ retryable: true, message: expect.stringContaining('Serveur injoignable') });
  });

  it('cite le statut HTTP quand l’erreur n’a pas de corps JSON', async () => {
    const { api } = client(() => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(api.listFiles()).rejects.toMatchObject({ retryable: true, message: 'API /files : 502 Bad Gateway' });
  });

  it('laisse passer l’annulation de la tâche sans la transformer en panne serveur', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = new DOMException('annulée', 'AbortError');
    const { api } = client(() => { throw reason; }, controller.signal);
    await expect(api.listFiles()).rejects.toBe(reason);
  });

  it('envoie les corps JSON avec le bon type et la bonne méthode', async () => {
    const { api, fetchMock } = client(() => Response.json({ status: 'pending', actionId: FILE_ID, expiresAt: '2026-11-18T10:15:00Z' }));
    const action = { type: 'hue.activate_scene' as const, payload: { sceneId: 's1' } };
    await expect(api.requestAction(action, 'Scène « Cinéma »')).resolves.toMatchObject({ status: 'pending' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://dashia.test/api/agent/actions');
    expect(init!.method).toBe('POST');
    expect(new Headers(init!.headers).get('content-type')).toBe('application/json');
    expect(sentBody(fetchMock)).toEqual({ action, summary: 'Scène « Cinéma »' });
  });

  it.each([
    ['readFile', (api: ApiClient) => api.readFile(FILE_ID, 8000), `/files/${FILE_ID}/text?offset=8000`, { fileId: FILE_ID, name: 'a', text: 't', offset: 8000, totalLength: 9000 }],
    ['getAgenda', (api: ApiClient) => api.getAgenda({ from: '2026-11-01T00:00:00+01:00', to: '2026-11-08T00:00:00+01:00' }), '/agenda?from=2026-11-01T00%3A00%3A00%2B01%3A00&to=2026-11-08T00%3A00%3A00%2B01%3A00', { items: [], calendarConnected: true }],
    ['listRoutines', (api: ApiClient) => api.listRoutines(), '/routines', { routines: [] }],
    ['runRoutine', (api: ApiClient) => api.runRoutine(FILE_ID), `/routines/${FILE_ID}/run`, { status: 'success', steps: [] }],
    ['getChatLlmConfig', (api: ApiClient) => api.getChatLlmConfig(), '/llm', { provider: 'dashia' }],
    ['exactSearch', (api: ApiClient) => api.exactSearch({ query: 'EDF', limit: 10 }), '/search/exact', { results: [] }],
    ['semanticSearch', (api: ApiClient) => api.semanticSearch({ embedModel: 'bge-m3', embedding: [], limit: 5 }), '/search/semantic', { results: [] }],
    ['saveIndex', (api: ApiClient) => api.saveIndex(FILE_ID, { embedModel: 'bge-m3', text: 't', chunks: [], analysis: { documentType: 'x', summary: 'y', keyInfo: { dates: [], amounts: [], names: [] }, suggestedActions: [] } }), `/files/${FILE_ID}/index-data`, { chunkCount: 0 }],
  ] as const)('%s appelle la bonne route et valide la réponse', async (_name, call, path, body) => {
    const { api, fetchMock } = client(() => Response.json(body));
    await expect(call(api)).resolves.toEqual(body);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://dashia.test/api/agent${path}`);
  });

  it('télécharge le fichier original en flux vers le disque', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-test-'));
    try {
      const { api, fetchMock } = client(() => new Response('contenu du PDF'));
      await api.downloadFile(FILE_ID, join(dir, 'source'));
      expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://dashia.test/api/agent/files/${FILE_ID}/raw`);
      await expect(readFile(join(dir, 'source'), 'utf8')).resolves.toBe('contenu du PDF');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuse un téléchargement sans contenu (réessayable)', async () => {
    const { api } = client(() => new Response(null));
    await expect(api.downloadFile(FILE_ID, '/nulle-part')).rejects.toMatchObject({ retryable: true, message: 'Fichier vide reçu du serveur' });
  });
});

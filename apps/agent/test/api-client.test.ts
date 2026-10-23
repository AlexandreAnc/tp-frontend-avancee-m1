import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/api/client';

const FILE_ID = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';

function client(reply: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => reply(String(url), init ?? {}));
  return { api: new ApiClient('https://dashia.test', 'task-token', new AbortController().signal), fetchMock };
}

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
});

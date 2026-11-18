import { MAX_CHAT_MESSAGE_LENGTH } from '@app/shared';
import { describe, expect, it, vi } from 'vitest';
import { installMode, isAppleMobile } from '../../utils/install';
import {
  clearOutboxes, flushOutbox, type FlushOutcome, isNetworkError, isTransientError, outboxKey, readOutbox, settleOutbox, writeOutbox, type OutboxEntry,
} from '../../utils/outbox';
import { filesFromShare, SHARE_TARGET_FIELD, storeSharedFiles, takeSharedFiles, type FileCache } from '../../utils/shared-files';

/** Cache Storage en mémoire, avec la même forme que l'API du navigateur. */
function memoryCache(): FileCache & { size: () => number } {
  const entries = new Map<string, Response>();
  const url = (key: string) => new URL(key, 'http://localhost').href;
  return {
    async put(key, response) { entries.set(url(key), response); },
    async keys() { return [...entries.keys()].map((key) => ({ url: key })); },
    async match(key) { return entries.get(url(key))?.clone(); },
    async delete(key) { return entries.delete(url(key)); },
    size: () => entries.size,
  };
}

/** localStorage en mémoire. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
  };
}

describe('fichiers partagés vers l’app', () => {
  it('garde les fichiers et les rend dans l’ordre, une seule fois', async () => {
    const cache = memoryCache();
    await storeSharedFiles(cache, [new File(['A'], 'a.pdf', { type: 'application/pdf' })], 1000);
    const count = await storeSharedFiles(cache, [
      new File(['B'], 'facture été.txt', { type: 'text/plain' }),
      new File(['C'], 'c.bin'),
    ], 2000);
    expect(count).toBe(2);

    const files = await takeSharedFiles(cache);
    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['a.pdf', 'application/pdf'],
      ['facture été.txt', 'text/plain'],
      ['c.bin', 'application/octet-stream'],
    ]);
    expect(await files[1]!.text()).toBe('B');
    expect(cache.size()).toBe(0);
    expect(await takeSharedFiles(cache)).toEqual([]);
  });

  it('ignore les entrées étrangères à la file et celles disparues entre-temps', async () => {
    const cache = memoryCache();
    await cache.put('/autre-chose', new Response('x'));
    await storeSharedFiles(cache, [new File(['A'], 'a.pdf')], 1);
    const keys = cache.keys.bind(cache);
    cache.keys = async () => [...await keys(), { url: 'http://localhost/__shared-files/9-0000' }];
    const files = await takeSharedFiles(cache);
    expect(files.map((file) => file.name)).toEqual(['a.pdf']);
    expect(cache.size()).toBe(1);
  });

  it('donne un nom par défaut à un fichier sans nom', async () => {
    const cache = memoryCache();
    await cache.put('/__shared-files/1-0000', new Response('x'));
    expect((await takeSharedFiles(cache))[0]!.name).toBe('document');
  });

  it('ne retient du formulaire de partage que les fichiers non vides', () => {
    const form = new FormData();
    form.append('title', 'Facture');
    form.append(SHARE_TARGET_FIELD, new File(['%PDF'], 'facture.pdf'));
    form.append(SHARE_TARGET_FIELD, new File([], 'vide.pdf'));
    form.append(SHARE_TARGET_FIELD, 'texte');
    expect(filesFromShare(form).map((file) => file.name)).toEqual(['facture.pdf']);
  });
});

describe('file d’envoi hors ligne', () => {
  const entry = (id: string, extra: Partial<OutboxEntry> = {}): OutboxEntry => ({ id, conversationId: 'c1', content: `message ${id}`, createdAt: '2026-11-18T10:00:00.000Z', ...extra });
  const describeError = (error: unknown) => (error as Error).message;
  const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

  it('est propre à chaque compte, et survit à un rechargement', () => {
    const storage = memoryStorage();
    writeOutbox(storage, outboxKey('u1'), [entry('1')]);
    expect(readOutbox(storage, outboxKey('u1'))).toEqual([entry('1')]);
    expect(readOutbox(storage, outboxKey('u2'))).toEqual([]);
    writeOutbox(storage, outboxKey('u1'), []);
    expect(storage.length).toBe(0);
  });

  it('ignore une valeur illisible ou invalide', () => {
    const storage = memoryStorage({
      [outboxKey('json')]: '{pas du json',
      [outboxKey('schema')]: JSON.stringify([{ id: '1', content: '' }]),
      [outboxKey('long')]: JSON.stringify([entry('1', { content: 'x'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1) })]),
    });
    for (const user of ['json', 'schema', 'long']) expect(readOutbox(storage, outboxKey(user))).toEqual([]);
  });

  it('est vidée pour tous les comptes à la déconnexion, sans toucher au reste', () => {
    const storage = memoryStorage({ [outboxKey('u1')]: '[]', [outboxKey('u2')]: '[]', 'dashia-theme': 'dark' });
    clearOutboxes(storage);
    expect(storage.length).toBe(1);
    expect(storage.getItem('dashia-theme')).toBe('dark');
  });

  it('distingue coupure réseau, erreur passagère et refus définitif', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(null)).toBe(true);
    expect(isNetworkError(httpError(500))).toBe(false);
    expect(isNetworkError({ statusCode: 404 })).toBe(false);
    expect([undefined, 429, 500, 503].map((status) => isTransientError(status ? httpError(status) : new Error('réseau')))).toEqual([true, true, true, true]);
    expect([400, 401, 404, 413].map((status) => isTransientError(httpError(status)))).toEqual([false, false, false, false]);
  });

  it('envoie dans l’ordre et marque les refus définitifs', async () => {
    const send = vi.fn(async (item: OutboxEntry) => {
      if (item.id === '2') throw httpError(404);
    });
    const outcomes = await flushOutbox([entry('1'), entry('2'), entry('3'), entry('4', { error: 'déjà refusé' })], send, describeError);
    expect(send.mock.calls.map(([item]) => item.id)).toEqual(['1', '2', '3']);
    expect([...outcomes]).toEqual([['1', 'sent'], ['2', { error: 'HTTP 404' }], ['3', 'sent']]);
  });

  it('s’arrête à la première coupure pour garder l’ordre de la discussion', async () => {
    const send = vi.fn(async (item: OutboxEntry) => {
      if (item.id === '2') throw new TypeError('Failed to fetch');
    });
    const outcomes = await flushOutbox([entry('1'), entry('2'), entry('3')], send, describeError);
    expect(send).toHaveBeenCalledTimes(2);
    expect([...outcomes]).toEqual([['1', 'sent']]);
  });

  it('applique le résultat à la file actuelle, y compris les messages ajoutés pendant l’envoi', () => {
    const outcomes = new Map<string, FlushOutcome>([['1', 'sent'], ['2', { error: 'Discussion introuvable' }]]);
    expect(settleOutbox([entry('1'), entry('2'), entry('3'), entry('nouveau')], outcomes)).toEqual([
      entry('2', { error: 'Discussion introuvable' }),
      entry('3'),
      entry('nouveau'),
    ]);
  });
});

describe('installation de l’app', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

  it('reconnaît iPhone et iPad, même quand l’iPad se présente comme un Mac', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true);
    expect(isAppleMobile(MAC, 5)).toBe(true);
    expect(isAppleMobile(MAC, 0)).toBe(false);
    expect(isAppleMobile(ANDROID, 5)).toBe(false);
  });

  it('ne propose rien une fois installée, sinon l’invite, la marche iOS ou le menu du navigateur', () => {
    const context = { standalone: false, promptAvailable: false, userAgent: ANDROID, maxTouchPoints: 5 };
    expect(installMode({ ...context, standalone: true, promptAvailable: true })).toBe('installed');
    expect(installMode({ ...context, promptAvailable: true })).toBe('prompt');
    expect(installMode({ ...context, userAgent: IPHONE })).toBe('ios');
    expect(installMode(context)).toBe('manual');
  });
});

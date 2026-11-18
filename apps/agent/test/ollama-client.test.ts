import { EMBEDDING_DIMENSIONS } from '@app/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatBackend } from '../src/llm/chat-backend';
import { checkModels, listInstalledModels, LlmClient } from '../src/llm/ollama';
import { TaskError } from '../src/tasks/errors';

const config = { OLLAMA_URL: 'http://ollama.test', CHAT_MODEL: 'dashia-qwen3', EMBED_MODEL: 'bge-m3', CHAT_CONTEXT: 8192, CHAT_MAX_TOKENS: 1024 };

type Route = (body: Record<string, unknown>) => unknown;

/** Ollama simulé : une réponse par route (`/api/chat`, `/api/embed`…), corps des requêtes conservés. */
function fakeOllama(routes: Record<string, Route>) {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ path, body });
    const route = routes[path];
    if (!route) return Response.json({ error: `route ${path} absente` }, { status: 404 });
    try {
      return Response.json(route(body));
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }));
  return requests;
}

const chatReply = (doneReason = 'stop') => () => ({
  model: config.CHAT_MODEL, message: { role: 'assistant', content: 'Bonjour' }, done: true, done_reason: doneReason,
});
const vector = (dimensions = EMBEDDING_DIMENSIONS) => Array.from({ length: dimensions }, () => 0.1);
const client = (overrides: Partial<typeof config> = {}, signal = new AbortController().signal) =>
  new LlmClient({ ...config, ...overrides }, signal, false);

afterEach(() => vi.unstubAllGlobals());

describe('LlmClient.chat (Ollama)', () => {
  it('transmet la fenêtre de contexte et la longueur maximale de réponse', async () => {
    const requests = fakeOllama({ '/api/chat': chatReply() });
    const response = await client().chat({ messages: [{ role: 'user', content: 'Coucou' }], options: { temperature: 0 } });
    expect(response.message.content).toBe('Bonjour');
    expect(requests[0]!.body).toMatchObject({ model: 'dashia-qwen3', stream: false, options: { temperature: 0, num_ctx: 8192, num_predict: 1024 } });
  });

  it('laisse Ollama choisir contexte et longueur quand rien n’est configuré', async () => {
    const requests = fakeOllama({ '/api/chat': chatReply() });
    await client({ CHAT_CONTEXT: undefined, CHAT_MAX_TOKENS: undefined }).chat({ messages: [] });
    expect(requests[0]!.body.options).toEqual({});
  });

  it('échoue tout de suite quand le modèle boucle jusqu’à la limite, au lieu de rendre une réponse tronquée', async () => {
    fakeOllama({ '/api/chat': chatReply('length') });
    const chat = client().chat({ messages: [{ role: 'user', content: 'Éteins tout' }] });
    await expect(chat).rejects.toBeInstanceOf(TaskError);
    await expect(chat).rejects.toThrow(/interrompue après 1024 tokens/);
  });

  it('explique une réponse coupée par le contexte quand aucune limite de tokens n’est fixée', async () => {
    fakeOllama({ '/api/chat': chatReply('length') });
    const chat = client({ CHAT_MAX_TOKENS: undefined }).chat({ messages: [] });
    await expect(chat).rejects.toThrow('réponse du modèle interrompue par la fenêtre de contexte (le modèle a bouclé)');
    await expect(chat).rejects.not.toThrow(/undefined/);
  });

  it('rend réessayable une erreur d’Ollama', async () => {
    fakeOllama({ '/api/chat': () => { throw new Error('model not loaded'); } });
    await expect(client().chat({ messages: [] })).rejects.toMatchObject({ retryable: true, message: expect.stringContaining('Ollama : model not loaded') });
  });

  it('laisse passer l’annulation de la tâche sans la déguiser en erreur Ollama', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort(new Error('annulée'));
      throw init.signal!.reason;
    }));
    const error = await client({}, controller.signal).chat({ messages: [] }).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(TaskError);
  });

  it('délègue la conversation au fournisseur choisi, sans passer par Ollama', async () => {
    const requests = fakeOllama({});
    const backend: ChatBackend = {
      label: 'Claude', model: 'claude-opus-5-5', supportsThinking: true,
      chat: vi.fn(async () => ({ message: { role: 'assistant', content: 'Réponse de Claude' } })),
    };
    const signal = new AbortController().signal;
    const base = new LlmClient(config, signal, false, true);
    const llm = base.withChatBackend(backend);

    await expect(llm.chat({ messages: [{ role: 'user', content: 'Q' }], think: true })).resolves.toMatchObject({ message: { content: 'Réponse de Claude' } });
    expect(backend.chat).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'Q' }], tools: undefined, think: true }, signal);
    expect(requests).toEqual([]);
    expect(llm).toMatchObject({ chatModel: 'Claude · claude-opus-5-5', supportsThinking: true, supportsVision: true, embedModel: 'bge-m3' });
    // Le client d'origine garde le modèle du service.
    expect(base).toMatchObject({ chatModel: 'dashia-qwen3', supportsThinking: false });
  });
});

describe('LlmClient.embed', () => {
  it('envoie les textes par lots de 16 et garde leur ordre', async () => {
    const requests = fakeOllama({ '/api/embed': (body) => ({ embeddings: (body.input as string[]).map(() => vector()) }) });
    const texts = Array.from({ length: 40 }, (_, index) => `chunk ${index}`);
    const embeddings = await client().embed(texts);
    expect(embeddings).toHaveLength(40);
    expect(requests.map((request) => (request.body.input as string[]).length)).toEqual([16, 16, 8]);
    expect(requests[2]!.body).toMatchObject({ model: 'bge-m3', input: texts.slice(32) });
  });

  it('refuse un modèle qui ne produit pas la dimension attendue (non réessayable)', async () => {
    fakeOllama({ '/api/embed': () => ({ embeddings: [vector(768)] }) });
    await expect(client().embed(['a'])).rejects.toMatchObject({ retryable: false, message: expect.stringContaining(`${EMBEDDING_DIMENSIONS} dimensions`) });
  });

  it('rend réessayable une panne d’Ollama', async () => {
    fakeOllama({});
    await expect(client().embed(['a'])).rejects.toMatchObject({ retryable: true, message: expect.stringContaining('Ollama') });
  });
});

describe('listInstalledModels', () => {
  it('liste les modèles avec leurs capacités, même si l’un est illisible', async () => {
    fakeOllama({
      '/api/tags': () => ({ models: [{ name: 'qwen3:8b' }, { name: 'cassé' }] }),
      '/api/show': (body) => {
        if (body.model === 'cassé') throw new Error('manifest manquant');
        return { capabilities: ['completion', 'tools'] };
      },
    });
    await expect(listInstalledModels('http://ollama.test')).resolves.toEqual([
      { name: 'qwen3:8b', capabilities: ['completion', 'tools'] },
      { name: 'cassé', capabilities: [] },
    ]);
  });
});

describe('checkModels', () => {
  const show = (capabilities: Record<string, string[]>) => ({ '/api/show': (body: Record<string, unknown>) => {
    const found = capabilities[body.model as string];
    if (!found) throw new Error('not found');
    return { capabilities: found };
  } });

  it('annonce raisonnement et vision selon les capacités du modèle de chat', async () => {
    fakeOllama(show({ 'dashia-qwen3': ['tools', 'thinking', 'vision'], 'bge-m3': ['embedding'] }));
    await expect(checkModels(config)).resolves.toEqual({ supportsThinking: true, supportsVision: true });
    await expect(checkModels({ ...config, CHAT_THINKING: false })).resolves.toEqual({ supportsThinking: false, supportsVision: true });
  });

  it('explique comment installer un modèle absent', async () => {
    fakeOllama(show({ 'bge-m3': ['embedding'] }));
    await expect(checkModels(config)).rejects.toThrow('ollama pull dashia-qwen3');
  });

  it('refuse un modèle de chat sans outils ou un modèle d’embeddings qui n’en est pas un', async () => {
    fakeOllama(show({ 'dashia-qwen3': ['completion'], 'bge-m3': ['embedding'] }));
    await expect(checkModels(config)).rejects.toThrow('ne gère pas les outils');
    fakeOllama(show({ 'dashia-qwen3': ['tools'], 'bge-m3': ['completion'] }));
    await expect(checkModels(config)).rejects.toThrow("n'est pas un modèle d'embeddings");
  });
});

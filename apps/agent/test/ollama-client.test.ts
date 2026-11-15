import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmClient } from '../src/llm/ollama';
import { TaskError } from '../src/tasks/errors';

const config = { OLLAMA_URL: 'http://ollama.test', CHAT_MODEL: 'dashia-qwen3', EMBED_MODEL: 'bge-m3', CHAT_CONTEXT: 8192, CHAT_MAX_TOKENS: 1024 };

/** Ollama simulé : renvoie `doneReason` et garde le corps de la requête. */
function fakeOllama(doneReason: string) {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const body = { model: config.CHAT_MODEL, message: { role: 'assistant', content: 'Bonjour' }, done: true, done_reason: doneReason };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }));
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe('client Ollama', () => {
  it('transmet la fenêtre de contexte et la longueur maximale de réponse', async () => {
    const requests = fakeOllama('stop');
    const client = new LlmClient(config, new AbortController().signal, false);
    const response = await client.chat({ messages: [{ role: 'user', content: 'Coucou' }] });
    expect(response.message.content).toBe('Bonjour');
    expect(requests[0]?.options).toEqual({ num_ctx: 8192, num_predict: 1024 });
  });

  it('échoue tout de suite quand le modèle boucle jusqu’à la limite, au lieu de rendre une réponse tronquée', async () => {
    fakeOllama('length');
    const client = new LlmClient(config, new AbortController().signal, false);
    const chat = client.chat({ messages: [{ role: 'user', content: 'Éteins tout' }] });
    await expect(chat).rejects.toBeInstanceOf(TaskError);
    await expect(chat).rejects.toThrow(/interrompue après 1024 tokens/);
  });
});

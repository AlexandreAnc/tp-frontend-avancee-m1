import type { Tool } from 'ollama';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromAnthropicContent, toAnthropicMessages } from '../src/llm/anthropic';
import { createChatBackend } from '../src/llm/backends';
import { toolParameters, type ChatMessage } from '../src/llm/chat-backend';
import { fromOpenAiMessage, OpenAiCompatibleChat, toOpenAiMessages } from '../src/llm/openai-compatible';
import { TaskError } from '../src/tasks/errors';

const search = { function: { name: 'exact_search', arguments: { query: 'plombier' } } };

afterEach(() => vi.restoreAllMocks());

describe('adaptateur Claude', () => {
  it('extrait système, appels d’outils et regroupe les résultats d’un même tour', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'Règles' },
      { role: 'user', content: 'Combien ?' },
      { role: 'assistant', content: '', tool_calls: [search, { function: { name: 'list_files', arguments: {} } }] },
      { role: 'tool', tool_name: 'exact_search', content: '{"results":[]}' },
      { role: 'tool', tool_name: 'list_files', content: '{"files":[]}' },
    ];
    expect(toAnthropicMessages(history)).toEqual([
      { role: 'user', content: 'Combien ?' },
      { role: 'assistant', content: [
        { type: 'tool_use', id: 'call_2_0', name: 'exact_search', input: { query: 'plombier' } },
        { type: 'tool_use', id: 'call_2_1', name: 'list_files', input: {} },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'call_2_0', content: '{"results":[]}' },
        { type: 'tool_result', tool_use_id: 'call_2_1', content: '{"files":[]}' },
      ] },
    ]);
  });

  it('renvoie la réponse de Claude telle quelle (réflexion signée, identifiants réels)', () => {
    const content = [
      { type: 'thinking', thinking: 'Je cherche.', signature: 'sig' },
      { type: 'tool_use', id: 'toolu_1', name: 'exact_search', input: { query: 'plombier' } },
    ] as Parameters<typeof fromAnthropicContent>[0];
    const message = fromAnthropicContent(content);
    expect(message).toMatchObject({ content: '', thinking: 'Je cherche.', tool_calls: [search] });

    const replay = toAnthropicMessages([{ role: 'user', content: 'Q' }, message, { role: 'tool', content: 'ok' }]);
    expect(replay[1]).toEqual({ role: 'assistant', content });
    expect(replay[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] });
  });
});

describe('adaptateur Claude (cas limites)', () => {
  it('garde le texte d’un message assistant et relie un résultat orphelin à un identifiant de repli', () => {
    expect(toAnthropicMessages([
      { role: 'assistant', content: 'Bonjour' },
      { role: 'tool', content: 'perdu' },
      { role: 'user', content: 'Merci' },
    ])).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'Bonjour' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'perdu' }] },
      { role: 'user', content: 'Merci' },
    ]);
  });

  it('assemble texte et réflexion, ignore une réflexion vide', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Il doit ' },
      { type: 'text', text: '340 EUR.' },
    ] as Parameters<typeof fromAnthropicContent>[0];
    const message = fromAnthropicContent(content);
    expect(message).toEqual({ role: 'assistant', content: 'Il doit 340 EUR.', providerContent: content });
  });
});

describe('toolParameters', () => {
  it('retire $schema et fournit un objet vide pour un outil sans paramètres', () => {
    const withSchema = { type: 'function', function: { name: 'a', parameters: { $schema: 'https://json-schema.org', type: 'object', properties: {} } } } as Tool;
    expect(toolParameters(withSchema)).toEqual({ type: 'object', properties: {} });
    expect(toolParameters({ type: 'function', function: { name: 'b' } })).toEqual({ type: 'object', properties: {} });
  });
});

describe('adaptateur compatible OpenAI', () => {
  it('convertit les appels et relie chaque résultat à son identifiant', () => {
    const reply = fromOpenAiMessage({ content: null, tool_calls: [{ id: 'abc', type: 'function', function: { name: 'exact_search', arguments: '{"query":"plombier"}' } }] });
    expect(reply.tool_calls).toEqual([search]);
    expect(toOpenAiMessages([{ role: 'system', content: 'S' }, reply, { role: 'tool', content: 'ok' }])).toEqual([
      { role: 'system', content: 'S' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'abc', type: 'function', function: { name: 'exact_search', arguments: '{"query":"plombier"}' } }] },
      { role: 'tool', tool_call_id: 'abc', content: 'ok' },
    ]);
  });

  it('remplace des arguments illisibles par un objet vide (l’outil renverra l’erreur au modèle)', () => {
    const reply = fromOpenAiMessage({ content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'read_file', arguments: '{oops' } }] });
    expect(reply.tool_calls).toEqual([{ function: { name: 'read_file', arguments: {} } }]);
  });

  it('génère des identifiants quand l’historique vient d’Ollama, et un texte vide devient null', () => {
    expect(toOpenAiMessages([{ role: 'assistant', content: '', tool_calls: [search] }, { role: 'tool', content: 'ok' }, { role: 'tool', content: 'orphelin' }])).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_0_0', type: 'function', function: { name: 'exact_search', arguments: '{"query":"plombier"}' } }] },
      { role: 'tool', tool_call_id: 'call_0_0', content: 'ok' },
      { role: 'tool', tool_call_id: 'call_2', content: 'orphelin' },
    ]);
    expect(toOpenAiMessages([{ role: 'assistant', content: 'Bonjour' }])).toEqual([{ role: 'assistant', content: 'Bonjour' }]);
  });

  it('remplace des arguments vides ou non objets par un objet vide', () => {
    const reply = fromOpenAiMessage({ content: ' ok ', tool_calls: [
      { id: 'a', type: 'function', function: { name: 'list_files', arguments: '' } },
      { id: 'b', type: 'function', function: { name: 'list_files', arguments: '42' } },
    ] });
    expect(reply.content).toBe('ok');
    expect(reply.tool_calls!.map((toolCall) => toolCall.function.arguments)).toEqual([{}, {}]);
    expect(fromOpenAiMessage({ content: 'Fin.' })).toEqual({ role: 'assistant', content: 'Fin.' });
  });
});

describe('OpenAiCompatibleChat', () => {
  const chat = () => new OpenAiCompatibleChat('Mistral', 'https://api.example.test/v1', 'sk-test', 'mistral-large');
  const signal = () => new AbortController().signal;
  const reply = (body: unknown, status = 200) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status }));

  it('envoie la clé, le modèle, l’historique et les outils au format Chat Completions', async () => {
    const fetchMock = reply({ choices: [{ message: { content: 'Bonjour', tool_calls: [] } }] });
    const tool = { type: 'function', function: { name: 'list_files', description: 'Liste', parameters: { $schema: 'x', type: 'object', properties: {} } } } as Tool;
    const { message } = await chat().chat({ messages: [{ role: 'user', content: 'Salut' }], tools: [tool] }, signal());

    expect(message).toEqual({ role: 'assistant', content: 'Bonjour' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/chat/completions');
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer sk-test');
    expect(JSON.parse(String(init!.body))).toEqual({
      model: 'mistral-large',
      messages: [{ role: 'user', content: 'Salut' }],
      tools: [{ type: 'function', function: { name: 'list_files', description: 'Liste', parameters: { type: 'object', properties: {} } } }],
    });
  });

  it('n’envoie pas de liste d’outils vide', async () => {
    const fetchMock = reply({ choices: [{ message: { content: 'ok' } }] });
    await chat().chat({ messages: [], tools: [] }, signal());
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).not.toHaveProperty('tools');
  });

  it.each([
    [401, false, 'a refusé la clé'],
    [403, false, 'a refusé la clé'],
    [404, false, 'Modèle mistral-large introuvable chez Mistral'],
    [429, true, 'momentanément indisponible (429)'],
    [503, true, 'momentanément indisponible (503)'],
    [400, false, 'a refusé la demande : contexte trop long'],
  ])('classe une réponse %i (réessayable : %s)', async (status, retryable, message) => {
    reply({ error: { message: 'contexte trop long' } }, status);
    const error = await chat().chat({ messages: [] }, signal()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskError);
    expect(error).toMatchObject({ retryable, message: expect.stringContaining(message) });
  });

  it('cite le statut quand une erreur n’a ni message ni corps JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 422 }));
    await expect(chat().chat({ messages: [] }, signal())).rejects.toThrow('Mistral a refusé la demande : 422');
  });

  it('rend réessayables une réponse vide et un fournisseur injoignable', async () => {
    reply({ choices: [] });
    await expect(chat().chat({ messages: [] }, signal())).rejects.toMatchObject({ retryable: true, message: 'Réponse vide de Mistral' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(chat().chat({ messages: [] }, signal())).rejects.toMatchObject({ retryable: true, message: 'Mistral est injoignable' });
  });

  it('laisse passer l’annulation de la tâche', async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = new DOMException('annulée', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(reason);
    await expect(chat().chat({ messages: [] }, controller.signal)).rejects.toBe(reason);
  });
});

describe('createChatBackend', () => {
  it('garde le modèle du service pour dashia et choisit le bon protocole sinon', () => {
    expect(createChatBackend({ provider: 'dashia' })).toBeNull();
    expect(createChatBackend({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'k' })).toMatchObject({ label: 'Claude', model: 'claude-opus-5-5' });
    expect(createChatBackend({ provider: 'gemini', model: 'gemini-pro', apiKey: 'k' })).toMatchObject({ label: 'Gemini (Google)' });
  });
});

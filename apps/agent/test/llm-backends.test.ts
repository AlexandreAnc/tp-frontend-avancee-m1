import { describe, expect, it, vi } from 'vitest';
import { fromAnthropicContent, toAnthropicMessages } from '../src/llm/anthropic';
import { createChatBackend } from '../src/llm/backends';
import type { ChatMessage } from '../src/llm/chat-backend';
import { fromOpenAiMessage, OpenAiCompatibleChat, toOpenAiMessages } from '../src/llm/openai-compatible';
import { TaskError } from '../src/tasks/errors';

const search = { function: { name: 'exact_search', arguments: { query: 'plombier' } } };

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

  it('distingue une clé refusée (définitif) d’une indisponibilité (réessayable)', async () => {
    const chat = new OpenAiCompatibleChat('Mistral', 'https://api.example.test/v1', 'sk-test', 'mistral-large');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(chat.chat({ messages: [] }, new AbortController().signal)).rejects.toMatchObject({ retryable: false });
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const error = await chat.chat({ messages: [] }, new AbortController().signal).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskError);
    expect(error).toMatchObject({ retryable: true });
    fetchMock.mockRestore();
  });
});

describe('createChatBackend', () => {
  it('garde le modèle du service pour dashia et choisit le bon protocole sinon', () => {
    expect(createChatBackend({ provider: 'dashia' })).toBeNull();
    expect(createChatBackend({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'k' })).toMatchObject({ label: 'Claude', model: 'claude-opus-5-5' });
    expect(createChatBackend({ provider: 'gemini', model: 'gemini-pro', apiKey: 'k' })).toMatchObject({ label: 'Gemini (Google)' });
  });
});

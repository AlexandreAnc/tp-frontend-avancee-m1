import type { Tool } from 'ollama';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicChat } from '../src/llm/anthropic';
import type { ChatMessage } from '../src/llm/chat-backend';
import { TaskError } from '../src/tasks/errors';

type Reply = { status?: number; body: unknown };

/** API Anthropic simulée : `/v1/messages` et `/v1/models/{id}` (réflexion adaptative). */
function fakeAnthropic({ messages, adaptive }: { messages: Reply | (() => Reply); adaptive?: boolean | 'error' }) {
  const requests: { path: string; headers: Headers; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit) => {
    const path = new URL(String(url)).pathname;
    requests.push({ path, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null });
    const headers = { 'content-type': 'application/json', 'x-should-retry': 'false' };
    if (path.startsWith('/v1/models/')) {
      if (adaptive === 'error') return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }), { status: 500, headers });
      return new Response(JSON.stringify({ id: 'm', type: 'model', capabilities: { thinking: { types: { adaptive: { supported: adaptive ?? false } } } } }), { headers });
    }
    const reply = typeof messages === 'function' ? messages() : messages;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers });
  }));
  return requests;
}

const answer = (content: unknown[], stopReason = 'end_turn'): Reply => ({
  body: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude', content, stop_reason: stopReason, usage: { input_tokens: 1, output_tokens: 1 } },
});
const apiError = (status: number, message = 'refusé'): Reply => ({ status, body: { type: 'error', error: { type: 'error', message } } });

const tool: Tool = { type: 'function', function: { name: 'exact_search', description: 'Recherche', parameters: { $schema: 'x', type: 'object', properties: { query: { type: 'string' } } } as Tool['function']['parameters'] } };
const history: ChatMessage[] = [{ role: 'system', content: 'Règle 1' }, { role: 'system', content: 'Règle 2' }, { role: 'user', content: 'Combien ?' }];
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe('AnthropicChat', () => {
  it('envoie système, messages et outils, avec réflexion adaptative et repli serveur si le modèle les accepte', async () => {
    const requests = fakeAnthropic({ messages: answer([{ type: 'text', text: ' 340 EUR ' }]), adaptive: true });
    const chat = new AnthropicChat('sk-ant-test', 'claude-opus-5-5');
    const { message } = await chat.chat({ messages: history, tools: [tool], think: true }, signal());

    expect(message).toMatchObject({ role: 'assistant', content: '340 EUR' });
    const request = requests.find((entry) => entry.path === '/v1/messages')!;
    expect(request.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(request.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(request.body).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'Règle 1\n\nRègle 2',
      messages: [{ role: 'user', content: 'Combien ?' }],
      tools: [{ name: 'exact_search', description: 'Recherche', input_schema: { type: 'object', properties: { query: { type: 'string' } } } }],
      thinking: { type: 'adaptive', display: 'summarized' },
      fallbacks: 'default',
    });
    expect((request.body!.tools as Record<string, unknown>[])[0]!.input_schema).not.toHaveProperty('$schema');
  });

  it('ne demande pas de réflexion à un modèle qui ne la gère pas, et ne relit pas ses capacités', async () => {
    const requests = fakeAnthropic({ messages: answer([{ type: 'text', text: 'ok' }]), adaptive: false });
    const chat = new AnthropicChat('k', 'claude-haiku-test');
    await chat.chat({ messages: history, think: true }, signal());
    await chat.chat({ messages: history, think: true }, signal());
    const sent = requests.filter((entry) => entry.path === '/v1/messages');
    expect(sent.every((entry) => !('thinking' in entry.body!) && !('fallbacks' in entry.body!))).toBe(true);
    expect(requests.filter((entry) => entry.path.startsWith('/v1/models/'))).toHaveLength(1);
  });

  it('continue sans réflexion si les capacités du modèle sont illisibles', async () => {
    const requests = fakeAnthropic({ messages: answer([{ type: 'text', text: 'ok' }]), adaptive: 'error' });
    await new AnthropicChat('k', 'claude-unknown-test').chat({ messages: history, think: true }, signal());
    expect(requests.find((entry) => entry.path === '/v1/messages')!.body).not.toHaveProperty('thinking');
  });

  it('réponse finale forcée : garde les définitions d’outils mais interdit de les appeler', async () => {
    const requests = fakeAnthropic({ messages: answer([{ type: 'text', text: 'ok' }]) });
    const chat = new AnthropicChat('k', 'claude-sonnet-test');
    await chat.chat({ messages: history, tools: [tool] }, signal());
    const withCalls: ChatMessage[] = [...history, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'exact_search', arguments: { query: 'x' } } }] }, { role: 'tool', content: '{}' }];
    await chat.chat({ messages: withCalls }, signal());
    expect(requests.at(-1)!.body).toMatchObject({ tools: [expect.objectContaining({ name: 'exact_search' })], tool_choice: { type: 'none' } });
  });

  it('remplace un refus de Claude par un message lisible', async () => {
    fakeAnthropic({ messages: answer([], 'refusal') });
    const { message } = await new AnthropicChat('k', 'claude-sonnet-test').chat({ messages: history }, signal());
    expect(message.content).toBe('Claude a refusé de traiter cette demande.');
  });

  it.each([
    [401, false, 'refusé la clé'],
    [403, false, 'refusé la clé'],
    [404, false, 'Modèle Claude introuvable'],
    [400, false, 'Claude a refusé la demande'],
    [429, true, 'Limite de requêtes'],
    [529, true, 'Claude est indisponible (529)'],
  ])('classe une erreur %i (réessayable : %s)', async (status, retryable, message) => {
    fakeAnthropic({ messages: apiError(status) });
    const error = await new AnthropicChat('k', 'claude-sonnet-test').chat({ messages: history }, signal()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TaskError);
    expect(error).toMatchObject({ retryable, message: expect.stringContaining(message) });
  });

  it('laisse passer l’annulation de la tâche sans la déguiser en erreur Claude', async () => {
    const requests = fakeAnthropic({ messages: answer([{ type: 'text', text: 'ok' }]) });
    const controller = new AbortController();
    controller.abort();
    const aborted = await new AnthropicChat('k', 'claude-sonnet-test').chat({ messages: history }, controller.signal).catch((caught: unknown) => caught);
    expect(aborted).toBeInstanceOf(Error);
    expect(aborted).not.toBeInstanceOf(TaskError);
    expect(requests).toEqual([]);
  });
});

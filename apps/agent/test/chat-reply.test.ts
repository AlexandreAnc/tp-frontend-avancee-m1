import type { ChatLlmConfig } from '@app/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import { AnthropicChat } from '../src/llm/anthropic';
import type { LlmClient } from '../src/llm/ollama';
import { replyToChat } from '../src/tasks/chat-reply';
import type { TaskContext } from '../src/tasks/context';

const runOrchestrator = vi.hoisted(() => vi.fn());
vi.mock('../src/loop/orchestrator', () => ({ runOrchestrator }));

const payload = {
  conversationId: '849fea72-3abd-4321-9ff7-00a5d3ee67cf',
  messageId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
  history: [{ role: 'user' as const, content: 'Bonjour' }],
};

function setup(llmConfig: ChatLlmConfig) {
  const external = { label: 'externe' } as unknown as LlmClient;
  const withChatBackend = vi.fn(() => external);
  const llm = { withChatBackend } as unknown as LlmClient;
  const signal = new AbortController().signal;
  const context: TaskContext = {
    taskId: 't1',
    api: { getChatLlmConfig: vi.fn(async () => llmConfig) } as unknown as ApiClient,
    llm,
    timezone: 'Europe/Paris',
    signal,
    emitStep: vi.fn(),
    emitDraft: vi.fn(),
  };
  return { context, llm, external, withChatBackend, signal };
}

beforeEach(() => runOrchestrator.mockReset().mockResolvedValue('Bonjour !'));

describe('replyToChat', () => {
  it('répond avec le modèle du service quand l’utilisateur n’a pas choisi de fournisseur', async () => {
    const { context, llm, withChatBackend, signal } = setup({ provider: 'dashia' });
    await expect(replyToChat(payload, context)).resolves.toEqual({ content: 'Bonjour !' });
    expect(withChatBackend).not.toHaveBeenCalled();
    expect(runOrchestrator).toHaveBeenCalledWith({
      history: payload.history,
      context: { api: context.api, llm, timezone: 'Europe/Paris' },
      emitStep: context.emitStep,
      emitDraft: context.emitDraft,
      signal,
    });
  });

  it('passe la conversation au fournisseur choisi, avec la clé de l’utilisateur', async () => {
    const { context, external, withChatBackend } = setup({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant' });
    await replyToChat(payload, context);
    expect(withChatBackend).toHaveBeenCalledWith(expect.any(AnthropicChat));
    expect(runOrchestrator.mock.calls[0]![0].context.llm).toBe(external);
  });

  it('remplace une réponse vide par une invitation à reformuler', async () => {
    runOrchestrator.mockResolvedValue('');
    const { context } = setup({ provider: 'dashia' });
    await expect(replyToChat(payload, context)).resolves.toEqual({ content: expect.stringContaining('reformuler') });
  });
});

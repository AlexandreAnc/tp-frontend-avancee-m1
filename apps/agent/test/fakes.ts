import type { ChatResponse, Message } from 'ollama';
import { vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import type { LlmClient } from '../src/llm/ollama';
import type { ToolContext } from '../src/tools/types';

/** Modèle factice qui renvoie les messages prévus, dans l'ordre. */
export function fakeLlm(replies: Partial<Message>[]) {
  const queue = [...replies];
  const chat = vi.fn(async () => ({ message: { role: 'assistant', content: '', ...queue.shift() } }) as ChatResponse);
  const embed = vi.fn(async (texts: string[]) => texts.map(() => Array.from({ length: 1024 }, () => 0.1)));
  const llm = { chat, embed, embedModel: 'bge-m3', chatModel: 'test', supportsThinking: true } as unknown as LlmClient;
  return { llm, chat, embed };
}

export function fakeContext(api: Partial<Record<keyof ApiClient, unknown>>, llm: LlmClient): ToolContext {
  return { api: api as unknown as ApiClient, llm, timezone: 'Europe/Paris' };
}

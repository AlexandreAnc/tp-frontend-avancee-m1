import { SPECIALISTS, type AgentRole } from '@app/shared';
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

export type Replies = Partial<Record<AgentRole, Partial<Message>[]>>;

/** Modèle factice : chaque agent (reconnu à son prompt système) dépile ses propres réponses. */
export function scriptedLlm(replies: Replies) {
  const queues = Object.fromEntries(Object.entries(replies).map(([role, list]) => [role, [...list]])) as Replies;
  const calls: { role: AgentRole; messages: Message[]; tools?: { function: { name: string } }[]; streamed: boolean }[] = [];
  const roleOf = (system: string): AgentRole =>
    (Object.keys(SPECIALISTS) as (keyof typeof SPECIALISTS)[]).find((name) => system.includes(`spécialiste ${SPECIALISTS[name].label} d'une équipe`)) ?? 'orchestrator';
  const chat = vi.fn(async (request: { messages: Message[]; tools?: { function: { name: string } }[]; onContent?: (text: string) => void }) => {
    const role = roleOf(request.messages[0]!.content);
    calls.push({ role, messages: [...request.messages], tools: request.tools, streamed: Boolean(request.onContent) });
    // Laisse les spécialistes lancés en parallèle s'entrelacer.
    await new Promise((resolve) => setTimeout(resolve, 1));
    const message = { role: 'assistant', content: '', ...queues[role]?.shift() };
    // Réponse en flux : le texte arrive en deux morceaux.
    if (request.onContent && message.content) {
      request.onContent(message.content.slice(0, Math.ceil(message.content.length / 2)));
      request.onContent(message.content);
    }
    return { message } as ChatResponse;
  });
  const llm = { chat, supportsThinking: true } as unknown as LlmClient;
  return { llm, calls };
}

export const call = (name: string, args: Record<string, unknown>) => ({ function: { name, arguments: args } });

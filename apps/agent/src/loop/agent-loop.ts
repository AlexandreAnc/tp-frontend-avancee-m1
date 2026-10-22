import { MAX_AGENT_ITERATIONS, type AgentStep } from '@app/shared';
import type { Message } from 'ollama';
import { TaskError } from '../tasks/errors';
import { runTool, toOllamaTools, type ToolCallResult } from '../tools';
import type { ToolContext } from '../tools/types';
import { buildSystemPrompt, FORCE_ANSWER_PROMPT } from './prompts';

export interface AgentLoopInput {
  history: { role: 'user' | 'assistant'; content: string }[];
  context: ToolContext;
  emitStep: (step: AgentStep) => Promise<void>;
  signal: AbortSignal;
  now?: Date;
}

/** Taille maximale d'un résultat d'outil renvoyé au modèle (le contexte n'est pas infini). */
const MAX_TOOL_RESULT_CHARS = 12_000;

function serializeForModel(result: ToolCallResult): string {
  const text = JSON.stringify(result.ok ? result.output : { error: result.error });
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [tronqué]` : text;
}

async function callTool(name: string, args: unknown, context: ToolContext): Promise<ToolCallResult> {
  try {
    return await runTool(name, args, context);
  } catch (error) {
    // Les erreurs qui invalident la tâche (serveur injoignable, token refusé) remontent ;
    // les autres sont renvoyées au modèle pour qu'il corrige son appel.
    if (error instanceof TaskError && !error.fatal) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Boucle agentique : le modèle choisit ses outils jusqu'à produire une réponse,
 * dans la limite de `MAX_AGENT_ITERATIONS` appels au modèle.
 */
export async function runAgentLoop({ history, context, emitStep, signal, now = new Date() }: AgentLoopInput): Promise<string> {
  const { llm } = context;
  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt(now, context.timezone) },
    ...history,
  ];
  const ollamaTools = toOllamaTools();

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    signal.throwIfAborted();
    const { message } = await llm.chat({ messages, tools: ollamaTools, think: llm.supportsThinking });

    if (message.thinking?.trim()) {
      await emitStep({ kind: 'thinking', text: message.thinking.trim() });
    }
    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      return message.content.trim();
    }

    for (const call of calls) {
      const { name, arguments: args } = call.function;
      await emitStep({ kind: 'tool_call', tool: name, input: args });
      const result = await callTool(name, args, context);
      await emitStep(result.ok
        ? { kind: 'tool_result', tool: name, output: result.output }
        : { kind: 'tool_result', tool: name, error: result.error });
      messages.push({ role: 'tool', tool_name: name, content: serializeForModel(result) });
    }
  }

  signal.throwIfAborted();
  messages.push({ role: 'user', content: FORCE_ANSWER_PROMPT });
  const { message } = await llm.chat({ messages, think: false });
  return message.content.trim();
}

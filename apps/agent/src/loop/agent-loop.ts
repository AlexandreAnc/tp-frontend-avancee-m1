import type { AgentRole, AgentStep } from '@app/shared';
import type { Message, Tool } from 'ollama';
import type { LlmClient } from '../llm/ollama';
import { TaskError } from '../tasks/errors';
import { FORCE_ANSWER_PROMPT } from './prompts';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Étape sans son auteur : la boucle ajoute `agent` et `parentId`. */
export type LocalStep = DistributiveOmit<AgentStep, 'agent' | 'parentId'>;

export interface ToolCall {
  name: string;
  args: unknown;
  /** Identifiant unique dans la tâche, pour relier l'appel, son résultat et les étapes d'une délégation. */
  callId: string;
}

export interface LoopInput {
  role: AgentRole;
  /** Délégation dans laquelle travaille ce spécialiste (absent pour l'orchestrateur). */
  parentId?: string;
  system: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  tools: Tool[];
  maxIterations: number;
  llm: LlmClient;
  emitStep: (step: AgentStep) => Promise<void>;
  signal: AbortSignal;
  /** Exécute un appel et renvoie le texte rendu au modèle. Publie ses propres étapes via `emit`. */
  runCall: (call: ToolCall, emit: (step: LocalStep) => Promise<void>) => Promise<string>;
}

/** Taille maximale d'un résultat renvoyé au modèle (le contexte n'est pas infini). */
const MAX_TOOL_RESULT_CHARS = 12_000;

export function serializeForModel(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [tronqué]` : text;
}

/** Une erreur non fatale est rendue au modèle pour qu'il corrige son appel ; les autres invalident la tâche. */
export function isRecoverable(error: unknown): error is TaskError {
  return error instanceof TaskError && !error.fatal;
}

/**
 * Boucle agentique commune à l'orchestrateur et aux spécialistes : le modèle appelle des outils
 * jusqu'à produire une réponse, dans la limite de `maxIterations` appels au modèle.
 * Les appels d'un même tour s'exécutent en parallèle.
 */
export async function runLoop(input: LoopInput): Promise<string> {
  const { llm, signal, role, parentId } = input;
  const emit = (step: LocalStep) => input.emitStep({ ...step, agent: role, ...(parentId ? { parentId } : {}) } as AgentStep);
  const messages: Message[] = [{ role: 'system', content: input.system }, ...input.history];
  const prefix = parentId ?? role;

  for (let iteration = 0; iteration < input.maxIterations; iteration++) {
    signal.throwIfAborted();
    const { message } = await llm.chat({ messages, tools: input.tools, think: llm.supportsThinking });

    if (message.thinking?.trim()) await emit({ kind: 'thinking', text: message.thinking.trim() });
    messages.push(message);

    const calls = (message.tool_calls ?? []).map((call, index): ToolCall => ({
      name: call.function.name,
      args: call.function.arguments,
      callId: `${prefix}.${iteration}.${index}`,
    }));
    if (calls.length === 0) return message.content.trim();

    // Tous les appels vont au bout avant de propager une erreur fatale : pas d'étape orpheline.
    const settled = await Promise.allSettled(calls.map((call) => input.runCall(call, emit)));
    const fatal = settled.find((result) => result.status === 'rejected');
    if (fatal) throw fatal.reason;
    settled.forEach((result, index) => {
      messages.push({ role: 'tool', tool_name: calls[index]!.name, content: (result as PromiseFulfilledResult<string>).value });
    });
  }

  signal.throwIfAborted();
  messages.push({ role: 'user', content: FORCE_ANSWER_PROMPT });
  const { message } = await llm.chat({ messages, think: false });
  return message.content.trim();
}

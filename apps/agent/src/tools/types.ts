import { toolDefinitions, type ToolInput, type ToolName, type ToolOutput } from '@app/shared';
import type { z } from 'zod';
import type { ApiClient } from '../api/client';
import type { LlmClient } from '../llm/ollama';
import { TaskError } from '../tasks/errors';

export interface ToolContext {
  api: ApiClient;
  llm: LlmClient;
  timezone: string;
}

export interface AgentTool<N extends ToolName = ToolName> {
  definition: (typeof toolDefinitions)[N];
  execute(input: ToolInput<N>, context: ToolContext): Promise<ToolOutput<N>>;
}

/** Associe une implémentation à la définition partagée de l'outil (description, schémas d'entrée et de sortie). */
export function defineAgentTool<N extends ToolName>(
  name: N,
  execute: AgentTool<N>['execute'],
): AgentTool<N> {
  return { definition: toolDefinitions[name], execute };
}

/**
 * Valide le payload d'une action construit à partir des arguments du modèle. Une erreur est rendue
 * au modèle (non fatale) pour qu'il corrige son appel, par exemple une fin d'événement avant son début.
 */
export function parseActionPayload<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new TaskError(parsed.error.issues.map((issue) => issue.message).join(', '), false, false);
  return parsed.data;
}

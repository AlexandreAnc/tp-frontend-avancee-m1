import { toolDefinitions, type ToolInput, type ToolName, type ToolOutput } from '@app/shared';
import type { ApiClient } from '../api/client';
import type { LlmClient } from '../llm/ollama';

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

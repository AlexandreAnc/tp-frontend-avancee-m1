import type { AgentStep } from '@app/shared';
import type { ApiClient } from '../api/client';
import type { LlmClient } from '../llm/ollama';

export interface TaskContext {
  taskId: string;
  api: ApiClient;
  llm: LlmClient;
  timezone: string;
  signal: AbortSignal;
  emitStep: (step: AgentStep) => Promise<void>;
  /** Brouillon de la réponse, envoyé au serveur s'il l'accepte (sinon ignoré). */
  emitDraft: (text: string) => void;
}

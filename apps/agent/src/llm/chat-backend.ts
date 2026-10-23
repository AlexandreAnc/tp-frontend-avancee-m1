import type { Message, Tool } from 'ollama';

/**
 * Message au format Ollama, utilisé par toute la boucle agentique. `providerContent` garde la réponse
 * brute d'un fournisseur externe (blocs de réflexion signés, identifiants d'appels) pour la lui renvoyer telle quelle.
 */
export type ChatMessage = Message & { providerContent?: unknown };

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: Tool[];
  think?: boolean;
}

/** Modèle de conversation d'un fournisseur externe (clé de l'utilisateur), derrière la même interface qu'Ollama. */
export interface ChatBackend {
  readonly label: string;
  readonly model: string;
  readonly supportsThinking: boolean;
  chat(request: ChatRequest, signal: AbortSignal): Promise<{ message: ChatMessage }>;
}

/** JSON Schema d'un outil sans la clé `$schema` (refusée ou ignorée selon les fournisseurs). */
export function toolParameters(tool: Tool): Record<string, unknown> {
  const { $schema: _ignored, ...parameters } = (tool.function.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>;
  return parameters;
}

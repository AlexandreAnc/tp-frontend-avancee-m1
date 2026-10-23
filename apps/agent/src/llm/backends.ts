import { EXTERNAL_AI_PROVIDERS, type ChatLlmConfig } from '@app/shared';
import { AnthropicChat } from './anthropic';
import type { ChatBackend } from './chat-backend';
import { OpenAiCompatibleChat } from './openai-compatible';

/** Modèle de conversation du fournisseur choisi par l'utilisateur ; `null` = modèle du service (Ollama). */
export function createChatBackend(config: ChatLlmConfig): ChatBackend | null {
  if (config.provider === 'dashia') return null;
  const definition = EXTERNAL_AI_PROVIDERS[config.provider];
  return definition.api === 'anthropic'
    ? new AnthropicChat(config.apiKey, config.model)
    : new OpenAiCompatibleChat(definition.label, definition.baseUrl, config.apiKey, config.model);
}

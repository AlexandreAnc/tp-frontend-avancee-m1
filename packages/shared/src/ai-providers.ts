import { z } from 'zod';

/**
 * Fournisseurs d'IA pour la conversation. `dashia` = le modèle du service, exécuté par les agents
 * (Ollama) ; les autres utilisent la clé d'API de l'utilisateur. L'analyse des documents, la recherche
 * et les embeddings restent toujours sur `dashia` : le drive n'est jamais envoyé en bloc à un tiers.
 */
export const AI_PROVIDERS = ['dashia', 'anthropic', 'openai', 'mistral', 'gemini'] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type ExternalAiProvider = Exclude<AiProvider, 'dashia'>;

export interface AiProviderDefinition {
  label: string;
  /** Protocole de l'API : Anthropic (Messages) ou compatible OpenAI (Chat Completions). */
  api: 'anthropic' | 'openai';
  /** Base de l'API compatible OpenAI. */
  baseUrl?: string;
  /** Page où l'utilisateur crée sa clé. */
  keysUrl: string;
  /** Modèle proposé par défaut s'il figure dans la liste du fournisseur. */
  defaultModel?: string;
}

export const EXTERNAL_AI_PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', api: 'anthropic', keysUrl: 'https://console.anthropic.com/settings/keys', defaultModel: 'claude-opus-5-5' },
  openai: { label: 'ChatGPT (OpenAI)', api: 'openai', baseUrl: 'https://api.openai.com/v1', keysUrl: 'https://platform.openai.com/api-keys' },
  mistral: { label: 'Mistral', api: 'openai', baseUrl: 'https://api.mistral.ai/v1', keysUrl: 'https://console.mistral.ai/api-keys' },
  gemini: { label: 'Gemini (Google)', api: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keysUrl: 'https://aistudio.google.com/apikey' },
} as const satisfies Record<ExternalAiProvider, AiProviderDefinition>;

export const aiApiKeySchema = z.string().trim().min(8).max(400).regex(/^\S+$/, 'Clé invalide');
export const aiModelSchema = z.string().trim().min(1).max(200);

/** Configuration du modèle de conversation transmise à l'agent pour une tâche (jamais stockée dans la file). */
export const chatLlmConfigSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('dashia') }),
  z.object({ provider: z.enum(['anthropic', 'openai', 'mistral', 'gemini']), model: aiModelSchema, apiKey: z.string().min(1) }),
]);
export type ChatLlmConfig = z.infer<typeof chatLlmConfigSchema>;

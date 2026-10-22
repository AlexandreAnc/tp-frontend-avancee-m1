import { AGENT_KEY_PREFIX, DEFAULT_EMBED_MODEL } from '@app/shared';
import { z } from 'zod';

const configSchema = z.object({
  SERVER_URL: z.url(),
  AGENT_KEY: z.string().startsWith(AGENT_KEY_PREFIX),
  AGENT_NAME: z.string().min(1).max(100),
  OLLAMA_URL: z.url().default('http://localhost:11434'),
  CHAT_MODEL: z.string().min(1),
  EMBED_MODEL: z.string().min(1).default(DEFAULT_EMBED_MODEL),
  AGENT_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  AGENT_TIMEZONE: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
});

export type AgentConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuration de l'agent invalide (voir .env.example) :\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

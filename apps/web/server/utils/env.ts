import { DEFAULT_EMBED_MODEL } from '@app/shared';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  /** URL publique de l'app (utilisée par Better Auth et les redirections OAuth). */
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  STORAGE_DIR: z.string().min(1).default('./.data/files'),
  /** Clé AES-256 en base64 (32 octets) pour chiffrer les tokens OAuth. */
  ENCRYPTION_KEY: z.base64().refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'ENCRYPTION_KEY doit faire 32 octets encodés en base64',
  }),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Application Philips Hue (developers.meethue.com) pour l'API cloud. */
  HUE_CLIENT_ID: z.string().optional(),
  HUE_CLIENT_SECRET: z.string().optional(),
  HUE_API_URL: z.url().default('https://api.meethue.com'),
  /** Modèle d'embeddings exigé des agents pour l'indexation et la recherche. */
  EMBED_MODEL: z.string().min(1).default(DEFAULT_EMBED_MODEL),
  /** Emails (séparés par des virgules) autorisés à gérer les clés d'agent. */
  ADMIN_EMAILS: z.string().default('').transform((value) =>
    value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  ),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Variables d'environnement validées. Lu à la demande pour ne pas bloquer `nuxt build`. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Variables d'environnement invalides :\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

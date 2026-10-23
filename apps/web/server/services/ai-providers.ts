import Anthropic from '@anthropic-ai/sdk';
import {
  EXTERNAL_AI_PROVIDERS,
  type AiProvider,
  type AiProviderDefinition,
  type ChatLlmConfig,
  type ExternalAiProvider,
} from '@app/shared';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { decrypt, encrypt } from '../utils/crypto';
import { AppError } from '../utils/errors';
import { getSettings } from './settings';

const { aiCredentials, userSettings } = schema;

/** Modèles qui ne servent pas à discuter (embeddings, audio, images…), écartés de la liste. */
const NON_CHAT_MODEL = /embed|moderation|whisper|tts|dall-e|image|audio|transcri|realtime|ocr|search|computer|veo|imagen|aqa/i;

/** Modèles de conversation disponibles avec cette clé ; une clé refusée lève une erreur de validation. */
export async function fetchProviderModels(provider: ExternalAiProvider, apiKey: string): Promise<string[]> {
  const definition = EXTERNAL_AI_PROVIDERS[provider];
  try {
    if (definition.api === 'anthropic') {
      const models: string[] = [];
      for await (const model of new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 }).models.list()) models.push(model.id);
      return models;
    }
    const response = await fetch(`${definition.baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) throw new AppError('validation', `${definition.label} a refusé cette clé`);
    if (!response.ok) throw new AppError('upstream', `${definition.label} est injoignable (${response.status})`);
    const body = await response.json() as { data?: { id: string }[] };
    return (body.data ?? []).map((model) => model.id.replace(/^models\//, '')).filter((id) => !NON_CHAT_MODEL.test(id)).sort();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AppError('validation', `${definition.label} a refusé cette clé`);
    }
    throw new AppError('upstream', `${definition.label} est injoignable`);
  }
}

async function credentialRow(userId: string, provider: ExternalAiProvider) {
  const [row] = await db.select().from(aiCredentials).where(and(eq(aiCredentials.userId, userId), eq(aiCredentials.provider, provider)));
  return row;
}

export async function getAiSettings(userId: string) {
  const [settings, rows] = await Promise.all([
    getSettings(userId),
    db.select().from(aiCredentials).where(eq(aiCredentials.userId, userId)),
  ]);
  return {
    provider: settings.aiProvider,
    providers: (Object.keys(EXTERNAL_AI_PROVIDERS) as ExternalAiProvider[]).map((provider) => {
      const row = rows.find((candidate) => candidate.provider === provider);
      return { provider, keyHint: row?.keyHint ?? null, model: row?.model ?? null };
    }),
  };
}

export type AiSettingsDto = Awaited<ReturnType<typeof getAiSettings>>;

/** Enregistre (ou remplace) la clé après l'avoir vérifiée auprès du fournisseur ; la clé n'est jamais renvoyée. */
export async function saveAiKey(userId: string, provider: ExternalAiProvider, apiKey: string): Promise<{ models: string[]; model: string }> {
  const models = await fetchProviderModels(provider, apiKey);
  if (models.length === 0) throw new AppError('validation', `Aucun modèle de conversation disponible avec cette clé ${EXTERNAL_AI_PROVIDERS[provider].label}`);
  const existing = await credentialRow(userId, provider);
  const preferred = (EXTERNAL_AI_PROVIDERS[provider] as AiProviderDefinition).defaultModel;
  const model = existing && models.includes(existing.model) ? existing.model : preferred && models.includes(preferred) ? preferred : models[0]!;
  const values = { apiKeyEnc: encrypt(apiKey), keyHint: apiKey.slice(-4), model, updatedAt: new Date() };
  await db.insert(aiCredentials).values({ userId, provider, ...values })
    .onConflictDoUpdate({ target: [aiCredentials.userId, aiCredentials.provider], set: values });
  return { models, model };
}

export async function listAiModels(userId: string, provider: ExternalAiProvider): Promise<string[]> {
  const row = await credentialRow(userId, provider);
  if (!row) throw new AppError('not_found', 'Aucune clé enregistrée pour ce fournisseur');
  return fetchProviderModels(provider, decrypt(row.apiKeyEnc));
}

/** Choisit l'IA de la conversation : le service, ou un fournisseur dont la clé est enregistrée. */
export async function setAiChoice(userId: string, provider: AiProvider): Promise<AiSettingsDto> {
  if (provider !== 'dashia' && !await credentialRow(userId, provider)) {
    throw new AppError('validation', `Ajoutez d'abord une clé ${EXTERNAL_AI_PROVIDERS[provider].label}`);
  }
  await getSettings(userId);
  await db.update(userSettings).set({ aiProvider: provider }).where(eq(userSettings.userId, userId));
  return getAiSettings(userId);
}

/** Modèle utilisé avec ce fournisseur (parmi ceux que sa clé permet). */
export async function setAiModel(userId: string, provider: ExternalAiProvider, model: string): Promise<AiSettingsDto> {
  const models = await listAiModels(userId, provider);
  if (!models.includes(model)) throw new AppError('validation', `Modèle indisponible chez ${EXTERNAL_AI_PROVIDERS[provider].label}`);
  await db.update(aiCredentials).set({ model, updatedAt: new Date() })
    .where(and(eq(aiCredentials.userId, userId), eq(aiCredentials.provider, provider)));
  return getAiSettings(userId);
}

/** Supprime la clé ; si ce fournisseur était utilisé, la conversation repasse sur l'IA du service. */
export async function deleteAiKey(userId: string, provider: ExternalAiProvider): Promise<AiSettingsDto> {
  await db.delete(aiCredentials).where(and(eq(aiCredentials.userId, userId), eq(aiCredentials.provider, provider)));
  await db.update(userSettings).set({ aiProvider: 'dashia' })
    .where(and(eq(userSettings.userId, userId), eq(userSettings.aiProvider, provider)));
  return getAiSettings(userId);
}

/** Modèle de conversation de l'utilisateur, clé déchiffrée : réservé à l'agent, via son token de tâche. */
export async function getChatLlmConfig(userId: string): Promise<ChatLlmConfig> {
  const settings = await getSettings(userId);
  if (settings.aiProvider === 'dashia') return { provider: 'dashia' };
  const row = await credentialRow(userId, settings.aiProvider);
  if (!row) return { provider: 'dashia' };
  return { provider: settings.aiProvider, model: row.model, apiKey: decrypt(row.apiKeyEnc) };
}

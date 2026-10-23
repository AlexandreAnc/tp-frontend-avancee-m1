import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { deleteAiKey, getAiSettings, getChatLlmConfig, saveAiKey, setAiChoice, setAiModel } from '../../server/services/ai-providers';
import { createUser, skipDb } from './helpers';

const MISTRAL_KEY = 'mst-test-0123456789-abcd';

/** API « compatible OpenAI » factice : accepte une seule clé et liste quelques modèles. */
function mockMistral() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const auth = new Headers(init?.headers).get('authorization');
    if (auth !== `Bearer ${MISTRAL_KEY}`) return new Response('{}', { status: 401 });
    return Response.json({ data: [{ id: 'mistral-large-latest' }, { id: 'mistral-embed' }, { id: 'mistral-small-latest' }] });
  });
}

afterEach(() => vi.restoreAllMocks());

describe.skipIf(skipDb)('IA au choix de l’utilisateur', () => {
  it('vérifie la clé, la stocke chiffrée et ne garde que les modèles de conversation', async () => {
    const userId = await createUser();
    mockMistral();
    const { models, model } = await saveAiKey(userId, 'mistral', MISTRAL_KEY);

    expect(models).toEqual(['mistral-large-latest', 'mistral-small-latest']);
    expect(model).toBe('mistral-large-latest');
    const [row] = await db.select().from(schema.aiCredentials).where(eq(schema.aiCredentials.userId, userId));
    expect(row!.apiKeyEnc).not.toContain(MISTRAL_KEY);
    expect(row!.keyHint).toBe('abcd');
    // La clé n'apparaît jamais dans ce qui part vers le navigateur.
    expect(JSON.stringify(await getAiSettings(userId))).not.toContain(MISTRAL_KEY);
  });

  it('refuse une clé invalide sans rien enregistrer', async () => {
    const userId = await createUser();
    mockMistral();
    await expect(saveAiKey(userId, 'mistral', 'mauvaise-cle-1234')).rejects.toMatchObject({ code: 'validation' });
    expect(await db.select().from(schema.aiCredentials).where(eq(schema.aiCredentials.userId, userId))).toEqual([]);
  });

  it('bascule la conversation sur le fournisseur, change de modèle, puis revient à DashIA en retirant la clé', async () => {
    const userId = await createUser();
    mockMistral();
    await expect(setAiChoice(userId, 'mistral')).rejects.toMatchObject({ code: 'validation' });
    expect(await getChatLlmConfig(userId)).toEqual({ provider: 'dashia' });

    await saveAiKey(userId, 'mistral', MISTRAL_KEY);
    await setAiChoice(userId, 'mistral');
    await setAiModel(userId, 'mistral', 'mistral-small-latest');
    await expect(setAiModel(userId, 'mistral', 'gpt-imaginaire')).rejects.toMatchObject({ code: 'validation' });
    expect(await getChatLlmConfig(userId)).toEqual({ provider: 'mistral', model: 'mistral-small-latest', apiKey: MISTRAL_KEY });

    const after = await deleteAiKey(userId, 'mistral');
    expect(after.provider).toBe('dashia');
    expect(await getChatLlmConfig(userId)).toEqual({ provider: 'dashia' });
  });

  it('isole les clés entre utilisateurs', async () => {
    const alice = await createUser();
    const bob = await createUser();
    mockMistral();
    await saveAiKey(alice, 'mistral', MISTRAL_KEY);
    await setAiChoice(alice, 'mistral');
    await expect(setAiChoice(bob, 'mistral')).rejects.toMatchObject({ code: 'validation' });
    expect(await getChatLlmConfig(bob)).toEqual({ provider: 'dashia' });
    expect((await getAiSettings(bob)).providers.every((entry) => entry.keyHint === null)).toBe(true);
  });
});

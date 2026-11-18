import { afterEach, describe, expect, it, vi } from 'vitest';

/** SDK Anthropic simulé : la liste des modèles dépend de la clé, sans appel réseau. */
vi.mock('@anthropic-ai/sdk', () => {
  class AuthenticationError extends Error {}
  class PermissionDeniedError extends Error {}
  class Anthropic {
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    models: { list: () => AsyncGenerator<{ id: string }> };
    constructor({ apiKey }: { apiKey: string }) {
      this.models = {
        async* list() {
          if (apiKey === 'cle-refusee') throw new AuthenticationError('invalid x-api-key');
          if (apiKey === 'cle-sans-droit') throw new PermissionDeniedError('forbidden');
          if (apiKey === 'cle-panne') throw new Error('ECONNRESET');
          yield { id: 'claude-opus-5-5' };
          yield { id: 'claude-haiku-4-5' };
        },
      };
    }
  }
  return { default: Anthropic };
});

const { fetchProviderModels } = await import('../../server/services/ai-providers');

describe('modèles des fournisseurs d’IA', () => {
  afterEach(() => vi.restoreAllMocks());

  it('liste les modèles Claude avec la clé de l’utilisateur', async () => {
    await expect(fetchProviderModels('anthropic', 'cle-valide')).resolves.toEqual(['claude-opus-5-5', 'claude-haiku-4-5']);
  });

  it('distingue une clé refusée (à corriger) d’un fournisseur injoignable', async () => {
    await expect(fetchProviderModels('anthropic', 'cle-refusee')).rejects.toMatchObject({ code: 'validation' });
    await expect(fetchProviderModels('anthropic', 'cle-sans-droit')).rejects.toMatchObject({ code: 'validation' });
    await expect(fetchProviderModels('anthropic', 'cle-panne')).rejects.toMatchObject({ code: 'upstream', message: 'Claude (Anthropic) est injoignable' });
  });

  it('nettoie la liste Gemini et signale une panne HTTP ou réseau', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
      data: [{ id: 'models/gemini-3-pro' }, { id: 'models/text-embedding-004' }, { id: 'models/gemini-3-flash' }],
    }));
    await expect(fetchProviderModels('gemini', 'cle')).resolves.toEqual(['gemini-3-flash', 'gemini-3-pro']);

    fetch.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(fetchProviderModels('openai', 'cle')).rejects.toMatchObject({ code: 'upstream', message: 'ChatGPT (OpenAI) est injoignable (500)' });

    fetch.mockResolvedValueOnce(Response.json({}));
    await expect(fetchProviderModels('openai', 'cle')).resolves.toEqual([]);

    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(fetchProviderModels('mistral', 'cle')).rejects.toMatchObject({ code: 'upstream', message: 'Mistral est injoignable' });
  });
});

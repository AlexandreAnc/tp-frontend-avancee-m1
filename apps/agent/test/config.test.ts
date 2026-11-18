import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const required = { SERVER_URL: 'https://dashia.test', AGENT_KEY: 'agk_secret', AGENT_NAME: 'mac-mini', CHAT_MODEL: 'qwen3:8b' };

describe('loadConfig', () => {
  it('applique les valeurs par défaut', () => {
    const config = loadConfig(required);
    expect(config).toMatchObject({
      ...required,
      OLLAMA_URL: 'http://localhost:11434',
      EMBED_MODEL: 'bge-m3',
      AGENT_CONCURRENCY: 1,
      CHAT_THINKING: true,
    });
    // Sans valeur, Ollama garde ses propres réglages (contexte selon la mémoire, réponse sans limite).
    expect(config.CHAT_CONTEXT).toBeUndefined();
    expect(config.CHAT_MAX_TOKENS).toBeUndefined();
    expect(config.AGENT_TIMEZONE).toBeTruthy();
  });

  it('convertit les nombres et booléens lus dans les variables d’environnement', () => {
    const config = loadConfig({ ...required, CHAT_CONTEXT: '16384', CHAT_MAX_TOKENS: '2048', CHAT_THINKING: 'false', AGENT_CONCURRENCY: '3', AGENT_TIMEZONE: 'America/New_York' });
    expect(config).toMatchObject({ CHAT_CONTEXT: 16_384, CHAT_MAX_TOKENS: 2048, CHAT_THINKING: false, AGENT_CONCURRENCY: 3, AGENT_TIMEZONE: 'America/New_York' });
  });

  it('refuse une clé sans préfixe d’agent et nomme les variables en cause', () => {
    expect(() => loadConfig({ ...required, AGENT_KEY: 'secret' })).toThrow(/AGENT_KEY/);
    expect(() => loadConfig({ ...required, SERVER_URL: undefined })).toThrow(/Configuration de l'agent invalide[\s\S]*SERVER_URL/);
  });

  it('refuse des limites hors bornes (concurrence, contexte trop petit)', () => {
    expect(() => loadConfig({ ...required, AGENT_CONCURRENCY: '0' })).toThrow(/AGENT_CONCURRENCY/);
    expect(() => loadConfig({ ...required, CHAT_CONTEXT: '512' })).toThrow(/CHAT_CONTEXT/);
    expect(() => loadConfig({ ...required, CHAT_THINKING: 'oui' })).toThrow(/CHAT_THINKING/);
  });
});

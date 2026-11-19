import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateToken, hashToken, safeEqual } from '../../server/utils/crypto';
import { AppError } from '../../server/utils/errors';
import { createEvent } from 'h3';
import { isAgentMessageTooLarge, MAX_AGENT_MESSAGE_CHARS, MAX_HELLO_MESSAGE_CHARS } from '../../server/utils/agent-socket-limits';
import { clientIp, createRateLimiter } from '../../server/utils/rate-limit';
import { buildSnippet } from '../../server/services/search';

describe('chiffrement des tokens OAuth', () => {
  it('déchiffre ce qui a été chiffré, avec un IV différent à chaque fois', () => {
    const first = encrypt('ya29.secret');
    expect(first).not.toContain('secret');
    expect(encrypt('ya29.secret')).not.toBe(first);
    expect(decrypt(first)).toBe('ya29.secret');
  });

  it('refuse un contenu altéré', () => {
    const [iv, tag, data] = encrypt('ya29.secret').split('.');
    const altered = [iv, tag, Buffer.from('autre').toString('base64url')].join('.');
    expect(() => decrypt(altered)).toThrow();
    expect(data).toBeTruthy();
  });

  it('refuse une valeur tronquée ou chiffrée avec une autre clé', () => {
    expect(() => decrypt('abc')).toThrow('Valeur chiffrée invalide');
    expect(() => decrypt(encrypt('secret', Buffer.alloc(32, 1).toString('base64')))).toThrow();
  });
});

describe('tokens', () => {
  it('génère des tokens préfixés uniques et compare leurs hash', () => {
    const token = generateToken('agk_');
    expect(token.startsWith('agk_')).toBe(true);
    expect(generateToken('agk_')).not.toBe(token);
    expect(safeEqual(hashToken(token), hashToken(token))).toBe(true);
    expect(safeEqual(hashToken(token), hashToken(`${token}x`))).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('oublie les fenêtres expirées quand beaucoup de clés se sont accumulées', () => {
    const consume = createRateLimiter({ limit: 1, windowMs: 1000, message: 'Trop de requêtes' });
    for (let index = 0; index <= 10_000; index++) consume(`ip-${index}`, 0);
    expect(() => consume('ip-0', 500)).toThrow(AppError);
    // Après la fenêtre, le nettoyage ne bloque pas les nouveaux venus et libère les anciens.
    consume('nouveau', 2000);
    consume('ip-0', 2000);
  });

  it('bloque au-delà de la limite puis libère après la fenêtre', () => {
    const consume = createRateLimiter({ limit: 2, windowMs: 1000, message: 'Trop de requêtes' });
    consume('user', 0);
    consume('user', 10);
    expect(() => consume('user', 20)).toThrow(AppError);
    consume('other', 20);
    consume('user', 1001);
  });
});

describe('buildSnippet', () => {
  it('centre l’extrait sur la première occurrence, sans tenir compte de la casse', () => {
    const content = `${'a'.repeat(400)} Facture N° 2026-042 ${'b'.repeat(400)}`;
    const snippet = buildSnippet(content, 'facture n° 2026');
    expect(snippet).toContain('Facture N° 2026-042');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });
});

describe('clientIp', () => {
  const eventWith = (headers: Record<string, string>) => createEvent(
    { url: '/', method: 'GET', headers, socket: { remoteAddress: '10.0.0.9' } } as never,
    {} as never,
  );

  it('lit l’IP posée par le proxy et ignore x-forwarded-for, que le client peut forger', () => {
    expect(clientIp(eventWith({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('retombe sur l’adresse de la connexion sans proxy (dev)', () => {
    expect(clientIp(eventWith({ 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.9');
  });
});

describe('limites du WebSocket des agents', () => {
  it('refuse un message trop gros avant de l’analyser, plus strictement avant l’authentification', () => {
    const hello = 'x'.repeat(MAX_HELLO_MESSAGE_CHARS + 1);
    expect(isAgentMessageTooLarge(hello, false)).toBe(true);
    expect(isAgentMessageTooLarge(hello, true)).toBe(false);
    expect(isAgentMessageTooLarge('x'.repeat(MAX_AGENT_MESSAGE_CHARS + 1), true)).toBe(true);
    expect(isAgentMessageTooLarge('{"type":"hello"}', false)).toBe(false);
  });
});

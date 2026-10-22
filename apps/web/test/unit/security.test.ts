import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateToken, hashToken, safeEqual } from '../../server/utils/crypto';
import { AppError } from '../../server/utils/errors';
import { createRateLimiter } from '../../server/utils/rate-limit';
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

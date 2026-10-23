import { describe, expect, it } from 'vitest';
import { isSessionUnverifiable, safeRedirect } from '../../utils/session';

// Non-régression : en prod, une limite de débit atteinte déconnectait tous les utilisateurs.
describe('isSessionUnverifiable', () => {
  it('garde la session inconnue sur une limite de débit, une panne ou une requête sans réponse', () => {
    expect(isSessionUnverifiable({ status: 429 })).toBe(true);
    expect(isSessionUnverifiable({ status: 502 })).toBe(true);
    expect(isSessionUnverifiable({})).toBe(true);
  });

  it('considère un refus explicite ou une réponse sans erreur comme une vraie réponse', () => {
    expect(isSessionUnverifiable({ status: 401 })).toBe(false);
    expect(isSessionUnverifiable(null)).toBe(false);
    expect(isSessionUnverifiable(undefined)).toBe(false);
  });
});

describe('safeRedirect', () => {
  it('garde un chemin interne', () => {
    expect(safeRedirect('/drive?folder=x')).toBe('/drive?folder=x');
  });

  it('refuse toute destination hors de l’app', () => {
    for (const target of ['//evil.example', '/\\evil.example', 'https://evil.example', 'drive', ['/drive'], undefined]) {
      expect(safeRedirect(target)).toBe('/');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { localToZonedIso } from '../src/tools/time';

describe('localToZonedIso', () => {
  it("applique l'heure d'hiver et l'heure d'été à la date de l'événement", () => {
    expect(localToZonedIso('2026-11-14T09:00', 'Europe/Paris')).toBe('2026-11-14T09:00:00+01:00');
    expect(localToZonedIso('2026-07-14T09:00', 'Europe/Paris')).toBe('2026-07-14T09:00:00+02:00');
  });

  it('gère les fuseaux à décalage négatif et les secondes', () => {
    expect(localToZonedIso('2026-11-14T09:00:30', 'America/New_York')).toBe('2026-11-14T09:00:30-05:00');
  });

  it("donne le décalage d'après le changement d'heure", () => {
    expect(localToZonedIso('2026-03-29T03:30', 'Europe/Paris')).toBe('2026-03-29T03:30:00+02:00');
  });
});

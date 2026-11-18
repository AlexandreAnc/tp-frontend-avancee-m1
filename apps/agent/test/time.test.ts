import { describe, expect, it } from 'vitest';
import { formatDateTime, localToZonedIso } from '../src/tools/time';

describe('localToZonedIso', () => {
  it("applique l'heure d'hiver et l'heure d'été à la date de l'événement", () => {
    expect(localToZonedIso('2026-11-14T09:00', 'Europe/Paris')).toBe('2026-11-14T09:00:00+01:00');
    expect(localToZonedIso('2026-07-14T09:00', 'Europe/Paris')).toBe('2026-07-14T09:00:00+02:00');
  });

  it('gère les fuseaux à décalage négatif et les secondes', () => {
    expect(localToZonedIso('2026-11-14T09:00:30', 'America/New_York')).toBe('2026-11-14T09:00:30-05:00');
  });

  it('gère UTC (décalage nul) et une date sans heure (minuit)', () => {
    expect(localToZonedIso('2026-11-14T09:00', 'UTC')).toBe('2026-11-14T09:00:00+00:00');
    expect(localToZonedIso('2026-11-14', 'Asia/Kolkata')).toBe('2026-11-14T00:00:00+05:30');
  });

  it("donne le décalage d'après le changement d'heure", () => {
    expect(localToZonedIso('2026-03-29T03:30', 'Europe/Paris')).toBe('2026-03-29T03:30:00+02:00');
  });
});

describe('formatDateTime', () => {
  it('affiche la date en français dans le fuseau demandé', () => {
    expect(formatDateTime('2026-11-14T08:00:00Z', 'Europe/Paris')).toBe('samedi 14 novembre 2026 à 09:00');
    expect(formatDateTime(new Date('2026-11-14T08:00:00Z'), 'America/New_York')).toBe('samedi 14 novembre 2026 à 03:00');
  });
});

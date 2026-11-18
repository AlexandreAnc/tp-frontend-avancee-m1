import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayRange, daysUntil, formatDayLong, formatDateTime, formatRelative, formatShortDate, formatTime, renderMarkdown } from '../../utils/format';

describe('renderMarkdown', () => {
  it("n'interprète jamais le HTML produit par le modèle", () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> **gras**');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>gras</strong>');
  });

  it('rend listes et code', () => {
    expect(renderMarkdown('- un\n- `deux`\n\n1. trois')).toBe('<ul><li>un</li><li><code>deux</code></li></ul><ol><li>trois</li></ol>');
  });

  it('rend les titres en gras, l’italique, et ferme une liste avant un paragraphe', () => {
    expect(renderMarkdown('## Titre\n- a\ntexte *important*')).toBe('<p><strong>Titre</strong></p><ul><li>a</li></ul><p>texte <em>important</em></p>');
  });

  it('passe d’une liste à puces à une liste numérotée sans les mélanger', () => {
    expect(renderMarkdown('- a\n1) b')).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
  });

  it('échappe les guillemets et apostrophes', () => {
    expect(renderMarkdown(`"a" & 'b'`)).toBe('<p>&quot;a&quot; &amp; &#39;b&#39;</p>');
  });
});

describe('dates', () => {
  afterEach(() => vi.useRealTimers());

  it('formatRelative : passé, futur et instant présent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    expect(formatRelative('2026-11-18T11:59:30Z')).toBe("à l'instant");
    expect(formatRelative('2026-11-18T11:55:00Z')).toBe('il y a 5 minutes');
    expect(formatRelative('2026-11-18T15:00:00Z')).toBe('dans 3 heures');
    expect(formatRelative('2026-11-17T12:00:00Z')).toBe('hier');
  });

  it('dayRange : début et fin du jour local, décalés', () => {
    const now = new Date(2026, 10, 18, 15, 30);
    expect(dayRange(now)).toEqual({ from: new Date(2026, 10, 18).toISOString(), to: new Date(2026, 10, 19).toISOString() });
    expect(dayRange(now, 1, 7)).toEqual({ from: new Date(2026, 10, 19).toISOString(), to: new Date(2026, 10, 26).toISOString() });
  });

  it('daysUntil : compte en jours calendaires, pour une date seule ou un instant', () => {
    const now = new Date(2026, 10, 18, 23, 59);
    expect(daysUntil('2026-11-18', now)).toBe(0);
    expect(daysUntil('2026-12-02', now)).toBe(14);
    expect(daysUntil('2026-11-17', now)).toBe(-1);
    expect(daysUntil(new Date(2026, 10, 19, 0, 1).toISOString(), now)).toBe(1);
  });

  it('formats français', () => {
    const date = new Date(2026, 10, 18, 9, 5);
    expect(formatTime(date.toISOString())).toBe('09:05');
    expect(formatShortDate(date.toISOString())).toBe('18/11');
    expect(formatDayLong(date)).toBe('Mercredi 18 novembre');
    expect(formatDateTime(date.toISOString())).toMatch(/18 nov\. 2026.*09:05/);
  });
});

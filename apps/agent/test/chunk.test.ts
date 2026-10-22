import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/extract/chunk';
import { normalizeText } from '../src/extract';

describe('chunkText', () => {
  it('garde un texte court en un seul chunk', () => {
    expect(chunkText('Bonjour.\n\nAu revoir.', 100, 10)).toEqual(['Bonjour.\n\nAu revoir.']);
  });

  it('ne dépasse jamais la taille demandée', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Paragraphe ${i} avec un peu de contenu pour remplir.`).join('\n\n');
    const chunks = chunkText(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(200);
  });

  it('coupe un paragraphe trop long et recouvre les chunks voisins', () => {
    const sentence = 'Une phrase de test assez longue. ';
    const chunks = chunkText(sentence.repeat(40), 300, 60);
    expect(chunks.length).toBeGreaterThan(2);
    const tail = chunks[0]!.slice(-30).trim();
    expect(chunks[1]).toContain(tail.split(' ').slice(-2).join(' '));
  });

  it('ne renvoie rien pour un texte vide', () => {
    expect(chunkText('')).toEqual([]);
  });
});

describe('normalizeText', () => {
  it('normalise espaces et retours à la ligne sans fusionner les paragraphes', () => {
    expect(normalizeText('A  b\r\n\r\n\r\n\r\nC  \n d')).toBe('A b\n\nC\nd');
  });
});

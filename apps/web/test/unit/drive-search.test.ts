import { describe, expect, it } from 'vitest';
import { folderNameKey, prefixQuery } from '../../server/services/drive';

describe('recherche du drive', () => {
  it('construit une requête par préfixes, sans opérateurs de l’utilisateur', () => {
    expect(prefixQuery('montant des loyers')).toBe('montant:* & des:* & loyer:*');
    expect(prefixQuery("carte grise & !(x) | 'y'")).toBe('carte:* & grise:*');
    expect(prefixQuery('!!! ??')).toBeNull();
  });

  it('compare les noms de dossier sans casse ni accents', () => {
    expect(folderNameKey('Impôts')).toBe(folderNameKey('IMPOTS'));
    expect(folderNameKey('Santé')).toBe('sante');
  });
});

import { describe, expect, it } from 'vitest';
import { assertSafeZip, MAX_ZIP_ENTRIES } from '../src/extract/zip-guard';
import { makeZip } from './zip';

const refused = (reason: string) => expect.objectContaining({ retryable: false, message: expect.stringContaining(reason) });

describe('assertSafeZip', () => {
  it('accepte un document normal, compressé ou non', () => {
    expect(() => assertSafeZip(makeZip([
      { name: '[Content_Types].xml', content: '<Types/>' },
      { name: 'word/document.xml', content: '<w:document>Bail</w:document>'.repeat(100) },
      { name: 'word/media/image1.png', content: 'png', method: 'stored' },
    ]))).not.toThrow();
  });

  it('refuse une archive qui se décompresse au-delà du plafond, même si elle est petite (zip bomb)', () => {
    const bomb = makeZip([{ name: 'word/document.xml', content: Buffer.alloc(5 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(10 * 1024);
    expect(() => assertSafeZip(bomb, 1024 * 1024)).toThrow(refused('trop volumineux'));
  });

  it('compte le total de toutes les entrées, pas seulement chacune', () => {
    const entries = Array.from({ length: 4 }, (_, index) => ({ name: `part${index}.xml`, content: Buffer.alloc(400 * 1024) }));
    expect(() => assertSafeZip(makeZip(entries), 1024 * 1024)).toThrow(refused('trop volumineux'));
  });

  it('se fie à la taille réellement décompressée, pas à celle que l’archive déclare', () => {
    const zip = makeZip([{ name: 'a.xml', content: Buffer.alloc(2 * 1024 * 1024) }]);
    // Taille décompressée déclarée dans l'annuaire central (offset 24) : on ment en annonçant 10 octets.
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(10, central + 24);
    expect(() => assertSafeZip(zip, 1024 * 1024)).toThrow(refused('trop volumineux'));
  });

  it('refuse ce qui n’est pas une archive lisible', () => {
    expect(() => assertSafeZip(Buffer.from('PK'))).toThrow(refused('illisible'));
    expect(() => assertSafeZip(Buffer.alloc(100))).toThrow(refused('illisible'));
    const zip = makeZip([{ name: 'a.xml', content: 'x' }]);
    expect(() => assertSafeZip(zip.subarray(10))).toThrow(refused('illisible'));
  });

  it('refuse une archive tronquée, corrompue, zip64, à méthode inconnue ou aux entrées trop nombreuses', () => {
    const zip = makeZip([{ name: 'a.xml', content: 'contenu'.repeat(50) }]);
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const end = zip.length - 22;

    const truncated = Buffer.from(zip);
    truncated.writeUInt32LE(100_000, central + 20);
    expect(() => assertSafeZip(truncated)).toThrow(refused('tronquée'));

    const corrupt = Buffer.from(zip);
    corrupt.fill(0xff, 30 + 'a.xml'.length, 30 + 'a.xml'.length + 4);
    expect(() => assertSafeZip(corrupt)).toThrow(refused('corrompue'));

    const zip64 = Buffer.from(zip);
    zip64.writeUInt32LE(0xffffffff, end + 16);
    expect(() => assertSafeZip(zip64)).toThrow(refused('zip64'));

    const bzip = Buffer.from(zip);
    bzip.writeUInt16LE(12, central + 10);
    expect(() => assertSafeZip(bzip)).toThrow(refused('méthode'));

    const many = Buffer.from(zip);
    many.writeUInt16LE(MAX_ZIP_ENTRIES + 1, end + 10);
    expect(() => assertSafeZip(many)).toThrow(refused('trop de fichiers'));

    const badLocal = Buffer.from(zip);
    badLocal.writeUInt32LE(0, 0);
    expect(() => assertSafeZip(badLocal)).toThrow(refused('illisible'));
  });
});

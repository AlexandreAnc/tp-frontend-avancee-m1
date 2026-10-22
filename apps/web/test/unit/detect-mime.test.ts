import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectMimeType, looksLikeText, textMimeTypeFromName } from '../../server/utils/detect-mime';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mime-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fileWith(name: string, content: Buffer | string) {
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

describe('detectMimeType', () => {
  it('reconnaît un PDF par sa signature, quelle que soit l’extension', async () => {
    const path = await fileWith('document.txt', '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    expect(await detectMimeType(path, 'document.txt')).toBe('application/pdf');
  });

  it('refuse un binaire déguisé en PDF', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const path = await fileWith('image.pdf', png);
    expect(await detectMimeType(path, 'image.pdf')).toBeNull();
  });

  it('accepte du texte UTF-8 et distingue Markdown par l’extension', async () => {
    const path = await fileWith('notes', '# Titre\n\nÉchéance : 15 novembre.');
    expect(await detectMimeType(path, 'notes.md')).toBe('text/markdown');
    expect(await detectMimeType(path, 'notes.txt')).toBe('text/plain');
  });

  it('refuse un binaire sans signature connue', async () => {
    const path = await fileWith('data.txt', Buffer.from([0x00, 0xff, 0x10, 0x00, 0x80]));
    expect(await detectMimeType(path, 'data.txt')).toBeNull();
  });
});

describe('looksLikeText', () => {
  it('tolère un caractère multi-octets coupé en fin d’échantillon', () => {
    const bytes = Buffer.from('café', 'utf8');
    expect(looksLikeText(bytes.subarray(0, bytes.length - 1))).toBe(true);
  });

  it('rejette un UTF-8 invalide', () => {
    expect(looksLikeText(Buffer.from([0x61, 0xc3, 0x28]))).toBe(false);
  });
});

describe('textMimeTypeFromName', () => {
  it('ne dépend que de l’extension', () => {
    expect(textMimeTypeFromName('README.MD')).toBe('text/markdown');
    expect(textMimeTypeFromName('a.md.txt')).toBe('text/plain');
  });
});

import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname } from 'node:path';
import { isAllowedMimeType, type AllowedMimeType } from '@app/shared';
import { fileTypeFromStream } from 'file-type';

const TEXT_SAMPLE_BYTES = 1024 * 1024;

/** Vrai si les octets sont de l'UTF-8 valide sans caractère NUL (fichier texte). */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    // `stream: true` tolère une séquence multi-octets coupée en fin d'échantillon.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

export function textMimeTypeFromName(fileName: string): AllowedMimeType {
  const extension = extname(fileName).toLowerCase();
  return extension === '.md' || extension === '.markdown' ? 'text/markdown' : 'text/plain';
}

/**
 * Détermine le type d'un fichier par son contenu réel, jamais par l'extension ou le Content-Type client.
 * PDF et DOCX ont une signature binaire ; txt et md n'en ont pas : on vérifie alors que le contenu
 * est du texte UTF-8, et seule la distinction txt / md s'appuie sur l'extension.
 * Renvoie `null` si le type n'est pas autorisé.
 */
export async function detectMimeType(filePath: string, fileName: string): Promise<AllowedMimeType | null> {
  // Pas `fileTypeFromFile` : il charge strtok3 par un import dynamique que le build de prod ne trace pas.
  const stream = createReadStream(filePath);
  const detected = await fileTypeFromStream(Readable.toWeb(stream) as ReadableStream<Uint8Array>).finally(() => stream.destroy());
  if (detected) {
    return isAllowedMimeType(detected.mime) ? detected.mime : null;
  }

  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(TEXT_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TEXT_SAMPLE_BYTES, 0);
    if (bytesRead === 0) return null;
    return looksLikeText(buffer.subarray(0, bytesRead)) ? textMimeTypeFromName(fileName) : null;
  } finally {
    await handle.close();
  }
}

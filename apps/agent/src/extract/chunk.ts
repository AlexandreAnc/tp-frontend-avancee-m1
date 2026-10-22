import { CHUNK_OVERLAP, CHUNK_SIZE } from '@app/shared';

/** Coupe un passage trop long à la dernière fin de phrase (ou espace) avant `size`. */
function splitLong(text: string, size: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
    const cut = sentenceEnd > size / 2 ? sentenceEnd + 1 : Math.max(window.lastIndexOf(' '), size / 2);
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Découpe un texte en chunks d'au plus `size` caractères, en respectant les paragraphes
 * quand c'est possible. Chaque chunk reprend la fin du précédent (`overlap`) pour ne pas
 * perdre une information coupée en deux.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const pieces = text.split(/\n{2,}/).flatMap((paragraph) => splitLong(paragraph.trim(), size - overlap)).filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > size) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      const boundary = tail.indexOf(' ');
      current = boundary >= 0 ? tail.slice(boundary + 1) : '';
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

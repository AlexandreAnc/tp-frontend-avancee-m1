import convert from 'heic-convert';
import type { LlmClient } from '../llm/ollama';
import { TaskError } from '../tasks/errors';

export const IMAGE_TRANSCRIPTION_PROMPT = [
  "Tu reçois la photo ou le scan d'un document de l'utilisateur.",
  'Transcris fidèlement tout le texte lisible, dans l’ordre de lecture, en conservant les montants, dates, références et noms.',
  "Si l'image ne contient pas de texte, décris précisément ce qu'elle montre. Réponds en français, sans commentaire.",
].join(' ');

/** Les photos HEIC (iPhone) sont converties en JPEG : le modèle vision ne lit pas ce format. */
async function toSupportedImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType !== 'image/heic') return buffer;
  const output = await convert({ buffer, format: 'JPEG', quality: 0.9 });
  return Buffer.from(output);
}

/** Texte d'une image, obtenu par le modèle vision de l'agent (OCR et description). */
export async function extractImage(buffer: Buffer, mimeType: string, llm: LlmClient): Promise<string> {
  if (!llm.supportsVision) {
    throw new TaskError(`Le modèle ${llm.chatModel} ne lit pas les images : choisissez un modèle « vision » pour l'agent`, false);
  }
  const image = await toSupportedImage(buffer, mimeType);
  const { message } = await llm.chat({
    messages: [
      { role: 'system', content: IMAGE_TRANSCRIPTION_PROMPT },
      { role: 'user', content: 'Voici le document.', images: [image.toString('base64')] },
    ],
    think: false,
    options: { temperature: 0 },
  });
  return message.content;
}

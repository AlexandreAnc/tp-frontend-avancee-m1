import { readFile } from 'node:fs/promises';
import { isAllowedMimeType, type AllowedMimeType } from '@app/shared';
import type { LlmClient } from '../llm/ollama';
import { TaskError } from '../tasks/errors';
import { extractDocx } from './docx';
import { extractImage } from './image';
import { extractPdf } from './pdf';
import { extractPlainText } from './text';
import { extractXlsx } from './xlsx';

type Extractor = (buffer: Buffer, llm: LlmClient) => Promise<string> | string;

const extractors: Record<AllowedMimeType, Extractor> = {
  'application/pdf': extractPdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': extractDocx,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractXlsx,
  'text/plain': extractPlainText,
  'text/markdown': extractPlainText,
  'image/jpeg': (buffer, llm) => extractImage(buffer, 'image/jpeg', llm),
  'image/png': (buffer, llm) => extractImage(buffer, 'image/png', llm),
  'image/heic': (buffer, llm) => extractImage(buffer, 'image/heic', llm),
};

/** Normalise les espaces sans casser les paragraphes (utilisés pour le découpage). */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractTextFromFile(path: string, mimeType: string, llm: LlmClient): Promise<string> {
  if (!isAllowedMimeType(mimeType)) {
    throw new TaskError(`Type de fichier non pris en charge : ${mimeType}`, false);
  }
  const buffer = await readFile(path);
  try {
    return normalizeText(await extractors[mimeType](buffer, llm));
  } catch (error) {
    if (error instanceof TaskError) throw error;
    throw new TaskError(`Lecture du fichier impossible : ${error instanceof Error ? error.message : String(error)}`, false);
  }
}

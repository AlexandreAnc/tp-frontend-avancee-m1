import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILE_CATEGORIES, fileAnalysisSchema, type FileAnalysis, type FileIndexPayload, type TaskResult } from '@app/shared';
import { z } from 'zod';
import { chunkText } from '../extract/chunk';
import { extractTextFromFile } from '../extract';
import { ANALYSIS_SYSTEM_PROMPT } from '../loop/prompts';
import type { LlmClient } from '../llm/ollama';
import type { TaskContext } from './context';
import { TaskError } from './errors';

/** Extrait du document transmis au modèle pour l'analyse (début du document). */
const ANALYSIS_INPUT_CHARS = 16_000;
const ANALYSIS_ATTEMPTS = 2;

/**
 * Schéma imposé au modèle : les champs optionnels du schéma partagé (pour les anciennes analyses)
 * sont ici obligatoires, sinon le modèle les omet.
 */
const generationSchema = fileAnalysisSchema.extend({
  category: z.enum(FILE_CATEGORIES),
  keyInfo: fileAnalysisSchema.shape.keyInfo.extend({
    dates: z.array(z.object({ label: z.string(), value: z.string(), iso: z.iso.date().nullable(), isDeadline: z.boolean() })).max(20),
  }),
});
const analysisJsonSchema = z.toJSONSchema(generationSchema);

export async function analyzeDocument(llm: LlmClient, fileName: string, text: string): Promise<FileAnalysis> {
  const excerpt = text.length > ANALYSIS_INPUT_CHARS ? `${text.slice(0, ANALYSIS_INPUT_CHARS)}\n[…]` : text;
  let lastError = '';

  for (let attempt = 0; attempt < ANALYSIS_ATTEMPTS; attempt++) {
    const { message } = await llm.chat({
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: `Nom du fichier : ${fileName}\n\nContenu :\n${excerpt}` },
      ],
      format: analysisJsonSchema,
      think: false,
      options: { temperature: 0 },
    });
    try {
      return fileAnalysisSchema.parse(JSON.parse(message.content));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new TaskError(`Analyse du document invalide : ${lastError}`, true);
}

/**
 * Indexe un fichier : téléchargement dans un dossier temporaire, extraction du texte,
 * découpage, embeddings, analyse, puis envoi au serveur. Rien n'est conservé sur la machine.
 */
export async function indexFile(payload: FileIndexPayload, context: TaskContext): Promise<TaskResult<'file.index'>> {
  const { api, llm, signal } = context;
  const workDir = await mkdtemp(join(tmpdir(), 'agent-'));

  try {
    const path = join(workDir, 'source');
    await api.downloadFile(payload.fileId, path);
    const text = await extractTextFromFile(path, payload.mimeType, llm);
    if (!text) {
      throw new TaskError('Aucun texte lisible dans ce document (PDF scanné ou fichier vide ?)', false);
    }
    signal.throwIfAborted();

    const chunks = chunkText(text);
    const embeddings = await llm.embed(chunks);
    signal.throwIfAborted();
    const analysis = await analyzeDocument(llm, payload.fileName, text);

    return await api.saveIndex(payload.fileId, {
      embedModel: llm.embedModel,
      text,
      chunks: chunks.map((content, index) => ({ index, content, embedding: embeddings[index]! })),
      analysis,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

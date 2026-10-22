import { z } from 'zod';
import { fileAnalysisSchema, FILE_STATUSES } from './analysis';
import { proposedActionSchema } from './actions';
import { EMBEDDING_DIMENSIONS } from './models';

/**
 * API HTTP de prod appelée par les outils de l'agent, authentifiée par le token de tâche
 * (`Authorization: Bearer <token>`). Toutes les routes sont sous `AGENT_API_PREFIX`.
 */
export const AGENT_API_PREFIX = '/api/agent';

const embeddingSchema = z.array(z.number()).length(EMBEDDING_DIMENSIONS);

export const agentFileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: z.enum(FILE_STATUSES),
  documentType: z.string().nullable(),
  summary: z.string().nullable(),
  /** Dossier du fichier (« Logement / 2026 », vide à la racine). */
  path: z.string(),
  createdAt: z.string(),
});

export const listFilesResponseSchema = z.object({
  files: z.array(agentFileSchema),
});

export const readFileQuerySchema = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  length: z.coerce.number().int().positive().max(20_000).default(8_000),
});

export const readFileResponseSchema = z.object({
  fileId: z.uuid(),
  name: z.string(),
  text: z.string(),
  offset: z.number().int(),
  totalLength: z.number().int(),
});

export const indexFileRequestSchema = z.object({
  embedModel: z.string(),
  text: z.string(),
  chunks: z.array(z.object({
    index: z.number().int().nonnegative(),
    content: z.string().min(1),
    embedding: embeddingSchema,
  })),
  analysis: fileAnalysisSchema,
});

export type IndexFileRequest = z.infer<typeof indexFileRequestSchema>;

export const semanticSearchRequestSchema = z.object({
  embedModel: z.string(),
  embedding: embeddingSchema,
  limit: z.number().int().min(1).max(20).default(5),
  fileIds: z.array(z.uuid()).optional(),
});

export const semanticSearchResponseSchema = z.object({
  results: z.array(z.object({
    fileId: z.uuid(),
    fileName: z.string(),
    chunkIndex: z.number().int(),
    content: z.string(),
    score: z.number(),
  })),
});

export const exactSearchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(10),
});

export const exactSearchResponseSchema = z.object({
  results: z.array(z.object({
    fileId: z.uuid(),
    fileName: z.string(),
    snippet: z.string(),
  })),
});

export const createActionRequestSchema = z.object({
  action: proposedActionSchema,
  /** Phrase courte affichée dans la notification et la carte de confirmation. */
  summary: z.string().min(1).max(300),
});

/**
 * Selon le niveau de risque du type d'action : `pending` (validation demandée à l'utilisateur)
 * ou `executed` (action sans risque exécutée directement par le serveur).
 */
export const createActionResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), actionId: z.uuid(), expiresAt: z.string() }),
  z.object({ status: z.literal('executed'), activityId: z.uuid(), result: z.unknown() }),
]);

export type CreateActionResponse = z.infer<typeof createActionResponseSchema>;

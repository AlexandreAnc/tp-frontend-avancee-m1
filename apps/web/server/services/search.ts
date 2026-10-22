import { and, cosineDistance, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { getEnv } from '../utils/env';
import { AppError } from '../utils/errors';

const { chunks, files } = schema;

export async function semanticSearch(userId: string, input: {
  embedModel: string;
  embedding: number[];
  limit: number;
  fileIds?: string[];
}) {
  if (input.embedModel !== getEnv().EMBED_MODEL) {
    throw new AppError('conflict', `Modèle d'embeddings ${input.embedModel} incompatible avec l'index (${getEnv().EMBED_MODEL})`);
  }
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, input.embedding)})`.mapWith(Number);

  const rows = await db.select({
    fileId: chunks.fileId,
    fileName: files.name,
    chunkIndex: chunks.chunkIndex,
    content: chunks.content,
    score: similarity,
  })
    .from(chunks)
    .innerJoin(files, eq(files.id, chunks.fileId))
    .where(and(
      eq(chunks.userId, userId),
      eq(chunks.embedModel, input.embedModel),
      input.fileIds?.length ? inArray(chunks.fileId, input.fileIds) : undefined,
    ))
    .orderBy(desc(similarity))
    .limit(input.limit);

  return { results: rows };
}

const SNIPPET_RADIUS = 160;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildSnippet(content: string, query: string): string {
  const position = content.toLowerCase().indexOf(query.toLowerCase());
  if (position < 0) return content.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, position - SNIPPET_RADIUS);
  const end = Math.min(content.length, position + query.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

export async function exactSearch(userId: string, input: { query: string; limit: number }) {
  const rows = await db.select({
    fileId: chunks.fileId,
    fileName: files.name,
    content: chunks.content,
  })
    .from(chunks)
    .innerJoin(files, eq(files.id, chunks.fileId))
    .where(and(eq(chunks.userId, userId), ilike(chunks.content, `%${escapeLike(input.query)}%`)))
    .orderBy(chunks.fileId, chunks.chunkIndex)
    .limit(input.limit);

  return {
    results: rows.map((row) => ({
      fileId: row.fileId,
      fileName: row.fileName,
      snippet: buildSnippet(row.content, input.query),
    })),
  };
}

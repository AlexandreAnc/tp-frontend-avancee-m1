import { basename } from 'node:path';
import type { Readable } from 'node:stream';
import {
  type FileCategory,
  formatBytes,
  MAX_FILE_SIZE_BYTES,
  MAX_STORAGE_BYTES_PER_USER,
  type FileStatus,
  type IndexFileRequest,
} from '@app/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema, type DbExecutor } from '../db';
import { detectMimeType } from '../utils/detect-mime';
import { getEnv } from '../utils/env';
import { AppError, notFound } from '../utils/errors';
import { uploadRateLimit } from '../utils/rate-limit';
import { publishToUser } from './events';
import { notifyIfAway } from './notify';
import { commitTemp, discardTemp, openStoredFile, removeStoredFile, writeStreamToTemp } from './storage';
import { cancelTasksFor, enqueueTask } from './tasks';

const { files, chunks } = schema;

export type StoredFile = typeof files.$inferSelect;

/** Condition « hors corbeille », à ajouter à toute requête qui liste ou lit des fichiers. */
export const activeFile = isNull(files.deletedAt);

/** Champs exposés au front (sans le texte extrait). */
export function toFileDto(file: StoredFile) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    status: file.status,
    analysis: file.analysis,
    category: file.category,
    folderId: file.folderId,
    starred: file.starred,
    deletedAt: file.deletedAt?.toISOString() ?? null,
    error: file.error,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

export type FileDto = ReturnType<typeof toFileDto>;

const fileTooLarge = () => new AppError('file_too_large', `Le fichier dépasse la taille maximale de ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);

const quotaExceeded = (usedBytes: number) => new AppError(
  'quota_exceeded',
  `Espace de stockage insuffisant : ${formatBytes(usedBytes)} utilisés sur ${formatBytes(MAX_STORAGE_BYTES_PER_USER)}. Supprimez des fichiers pour libérer de la place.`,
  { usedBytes, maxBytes: MAX_STORAGE_BYTES_PER_USER },
);

async function usedStorage(executor: DbExecutor, userId: string): Promise<number> {
  const [row] = await executor.select({ value: sql<number>`coalesce(sum(${files.sizeBytes}), 0)`.mapWith(Number) })
    .from(files).where(eq(files.userId, userId));
  return row?.value ?? 0;
}

export async function getQuota(userId: string) {
  return { usedBytes: await usedStorage(db, userId), maxBytes: MAX_STORAGE_BYTES_PER_USER };
}

function sanitizeFileName(raw: string): string {
  const name = basename(raw.replaceAll('\\', '/')).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 255);
  if (!name) throw new AppError('validation', 'Nom de fichier manquant');
  return name;
}

export async function uploadFile(userId: string, input: {
  fileName: string;
  stream: Readable;
  /** Dossier de destination (`null` ou absent : racine). */
  folderId?: string | null;
  /** Taille annoncée par le client (Content-Length) : permet de refuser avant de recevoir quoi que ce soit. */
  declaredBytes?: number;
}): Promise<FileDto> {
  uploadRateLimit(userId);
  const name = sanitizeFileName(input.fileName);

  // Vérifications rapides avant de recevoir le fichier ; celle qui fait foi est dans la transaction.
  if (input.declaredBytes && input.declaredBytes > MAX_FILE_SIZE_BYTES) throw fileTooLarge();
  const usedBefore = await usedStorage(db, userId);
  const remaining = MAX_STORAGE_BYTES_PER_USER - usedBefore;
  if (remaining <= 0 || (input.declaredBytes && input.declaredBytes > remaining)) throw quotaExceeded(usedBefore);

  // Le transfert est coupé dès qu'il dépasse la taille max d'un fichier ou la place restante.
  const limit = Math.min(MAX_FILE_SIZE_BYTES, remaining);
  const upload = await writeStreamToTemp(
    input.stream,
    limit,
    limit < MAX_FILE_SIZE_BYTES ? quotaExceeded(usedBefore) : fileTooLarge(),
  );

  try {
    if (upload.sizeBytes === 0) throw new AppError('validation', 'Le fichier est vide');
    const mimeType = await detectMimeType(upload.tempPath, name);
    if (!mimeType) {
      throw new AppError('unsupported_file_type', 'Type de fichier non pris en charge. Formats acceptés : PDF, TXT, Markdown, DOCX.');
    }

    const file = await db.transaction(async (tx) => {
      // Sérialise les uploads d'un même utilisateur : deux envois simultanés ne peuvent pas dépasser le quota.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const used = await usedStorage(tx, userId);
      if (used + upload.sizeBytes > MAX_STORAGE_BYTES_PER_USER) throw quotaExceeded(used);

      if (input.folderId) {
        const [folder] = await tx.select({ id: schema.folders.id }).from(schema.folders)
          .where(and(eq(schema.folders.id, input.folderId), eq(schema.folders.userId, userId)));
        if (!folder) throw notFound('Dossier');
      }
      const id = crypto.randomUUID();
      const [inserted] = await tx.insert(files).values({
        id,
        userId,
        folderId: input.folderId ?? null,
        name,
        mimeType,
        sizeBytes: upload.sizeBytes,
        storageKey: id,
      }).returning();
      await commitTemp(upload.tempPath, id);
      return inserted!;
    });

    await enqueueIndexing(file);
    return toFileDto(file);
  } finally {
    await discardTemp(upload.tempPath);
  }
}

async function enqueueIndexing(file: StoredFile): Promise<void> {
  await enqueueTask('file.index', file.userId, {
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType,
  }, { singletonKey: `file.index:${file.id}` });
  publishToUser(file.userId, { type: 'file.updated', fileId: file.id, status: file.status });
}

/** Fichiers en attente ou en cours d'analyse, du plus ancien au plus récent. */
export async function listPendingFiles(userId: string) {
  return db.select({ id: files.id, name: files.name, status: files.status }).from(files)
    .where(and(eq(files.userId, userId), activeFile, inArray(files.status, ['pending', 'processing'])))
    .orderBy(files.createdAt);
}

export async function listFiles(userId: string): Promise<StoredFile[]> {
  return db.select().from(files).where(and(eq(files.userId, userId), activeFile)).orderBy(desc(files.createdAt));
}

/** Fichier hors corbeille (`includeTrashed` pour la corbeille elle-même). */
export async function getFile(userId: string, fileId: string, options: { includeTrashed?: boolean } = {}): Promise<StoredFile> {
  const [file] = await db.select().from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId), options.includeTrashed ? undefined : activeFile));
  if (!file) throw notFound('Fichier');
  return file;
}

/** Supprime définitivement le fichier, ses chunks et embeddings (cascade) et le fichier stocké. Voir aussi `trash.ts`. */
export async function deleteFile(userId: string, fileId: string): Promise<void> {
  const [deleted] = await db.delete(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning({ storageKey: files.storageKey });
  if (!deleted) throw notFound('Fichier');
  cancelTasksFor({ userId, fileId });
  await removeStoredFile(deleted.storageKey);
  publishToUser(userId, { type: 'file.deleted', fileId });
}

/** Supprime les fichiers stockés d'un utilisateur (avant suppression du compte, les lignes partent en cascade). */
export async function removeAllStoredFiles(userId: string): Promise<void> {
  const rows = await db.select({ storageKey: files.storageKey }).from(files).where(eq(files.userId, userId));
  await Promise.all(rows.map((row) => removeStoredFile(row.storageKey)));
}

export async function reindexFile(userId: string, fileId: string): Promise<FileDto> {
  const file = await setFileStatus(userId, fileId, 'pending');
  await enqueueIndexing(file);
  return toFileDto(file);
}

export async function setFileCategory(userId: string, fileId: string, category: FileCategory | null): Promise<FileDto> {
  const [file] = await db.update(files).set({ category })
    .where(and(eq(files.id, fileId), eq(files.userId, userId), activeFile))
    .returning();
  if (!file) throw notFound('Fichier');
  publishToUser(userId, { type: 'file.updated', fileId, status: file.status });
  return toFileDto(file);
}

export async function setFileStatus(userId: string, fileId: string, status: FileStatus, error: string | null = null): Promise<StoredFile> {
  const [file] = await db.update(files)
    .set({ status, error, ...(status === 'failed' ? { processedAt: new Date() } : {}) })
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();
  if (!file) throw notFound('Fichier');
  publishToUser(userId, { type: 'file.updated', fileId, status });
  return file;
}

/** Postgres refuse le caractère NUL dans un `text`. */
const stripNul = (value: string) => value.replaceAll('\u0000', '');

/**
 * Enregistre le résultat de l'indexation. Idempotent : les chunks existants sont remplacés,
 * jamais dupliqués, pour qu'une tâche reprise par une autre machine donne le même état.
 */
export async function saveFileIndex(userId: string, fileId: string, data: IndexFileRequest): Promise<{ chunkCount: number }> {
  if (data.embedModel !== getEnv().EMBED_MODEL) {
    throw new AppError('conflict', `Modèle d'embeddings ${data.embedModel} refusé : le serveur attend ${getEnv().EMBED_MODEL}`);
  }
  await getFile(userId, fileId);

  await db.transaction(async (tx) => {
    await tx.delete(chunks).where(and(eq(chunks.fileId, fileId), eq(chunks.userId, userId)));
    if (data.chunks.length > 0) {
      await tx.insert(chunks).values(data.chunks.map((chunk) => ({
        userId,
        fileId,
        chunkIndex: chunk.index,
        content: stripNul(chunk.content),
        embedding: chunk.embedding,
        embedModel: data.embedModel,
      })));
    }
    await tx.update(files).set({
      extractedText: stripNul(data.text),
      analysis: data.analysis,
      embedModel: data.embedModel,
      status: 'ready',
      error: null,
      processedAt: new Date(),
    }).where(and(eq(files.id, fileId), eq(files.userId, userId)));
  });

  publishToUser(userId, { type: 'file.updated', fileId, status: 'ready' });
  const file = await getFile(userId, fileId);
  await notifyIfAway(userId, 'documentReady', {
    title: `${file.name} est prêt`,
    body: `${data.analysis.documentType} · ${data.analysis.summary}`.slice(0, 160),
    url: '/drive',
    tag: `file-${fileId}`,
  });
  return { chunkCount: data.chunks.length };
}

export async function readFileText(userId: string, fileId: string, range: { offset: number; length: number }) {
  const [row] = await db.select({
    id: files.id,
    name: files.name,
    totalLength: sql<number>`coalesce(char_length(${files.extractedText}), 0)`.mapWith(Number),
    text: sql<string>`coalesce(substring(${files.extractedText} from ${range.offset + 1}::int for ${range.length}::int), '')`,
  }).from(files).where(and(eq(files.id, fileId), eq(files.userId, userId), activeFile));
  if (!row) throw notFound('Fichier');
  return { fileId: row.id, name: row.name, text: row.text, offset: range.offset, totalLength: row.totalLength };
}

export async function openFileForAgent(userId: string, fileId: string) {
  const file = await getFile(userId, fileId);
  return { file, stream: openStoredFile(file.storageKey) };
}

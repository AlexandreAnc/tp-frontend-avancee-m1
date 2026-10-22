import { TRASH_RETENTION_DAYS } from '@app/shared';
import { and, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { notFound } from '../utils/errors';
import { ensureFolderPath, listFolderTree, pathLabel } from './drive';
import { publishToUser } from './events';
import { deleteFile, reindexFile, toFileDto } from './files';
import { cancelTasksFor } from './tasks';

const { files, folders, shareLinks } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Met des fichiers à la corbeille : ils disparaissent du drive, de la recherche et des outils de l'agent,
 * leurs liens de partage sont révoqués, mais ils restent restaurables `TRASH_RETENTION_DAYS` jours.
 */
export async function trashFiles(userId: string, fileIds: string[]): Promise<number> {
  const tree = await listFolderTree(userId);
  const rows = await db.select({ id: files.id, folderId: files.folderId }).from(files)
    .where(and(eq(files.userId, userId), isNull(files.deletedAt), inArray(files.id, fileIds)));
  if (rows.length !== new Set(fileIds).size) throw notFound('Fichier');

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.update(files).set({ deletedAt: now, trashedFromPath: pathLabel(tree, row.folderId) || null }).where(eq(files.id, row.id));
    }
    await tx.update(shareLinks).set({ revokedAt: now })
      .where(and(eq(shareLinks.userId, userId), inArray(shareLinks.fileId, fileIds), isNull(shareLinks.revokedAt)));
  });
  for (const row of rows) {
    cancelTasksFor({ userId, fileId: row.id });
    publishToUser(userId, { type: 'file.deleted', fileId: row.id });
  }
  publishToUser(userId, { type: 'drive.changed' });
  return rows.length;
}

export async function listTrash(userId: string) {
  const rows = await db.select().from(files)
    .where(and(eq(files.userId, userId), isNotNull(files.deletedAt)))
    .orderBy(desc(files.deletedAt));
  return rows.map((file) => ({
    ...toFileDto(file),
    path: file.trashedFromPath ?? '',
    purgeAt: new Date(file.deletedAt!.getTime() + TRASH_RETENTION_DAYS * DAY_MS).toISOString(),
  }));
}

/** Restaure dans le dossier d'origine, recréé à partir de son chemin s'il a été supprimé entre-temps. */
export async function restoreFiles(userId: string, fileIds: string[]): Promise<number> {
  const rows = await db.select().from(files)
    .where(and(eq(files.userId, userId), isNotNull(files.deletedAt), inArray(files.id, fileIds)));
  if (rows.length !== new Set(fileIds).size) throw notFound('Fichier');

  for (const row of rows) {
    let folderId = row.folderId;
    if (folderId) {
      const [folder] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
      folderId = folder?.id ?? null;
    }
    if (!folderId && row.trashedFromPath) folderId = await ensureFolderPath(userId, row.trashedFromPath);
    await db.update(files).set({ deletedAt: null, trashedFromPath: null, folderId }).where(eq(files.id, row.id));
    // L'analyse avait été annulée à la mise à la corbeille : on la relance.
    if (row.status === 'pending' || row.status === 'processing') await reindexFile(userId, row.id);
    else publishToUser(userId, { type: 'file.updated', fileId: row.id, status: row.status });
  }
  publishToUser(userId, { type: 'drive.changed' });
  return rows.length;
}

/** Suppression définitive de fichiers de la corbeille (`fileIds` absent : toute la corbeille). */
export async function deleteForever(userId: string, fileIds?: string[]): Promise<number> {
  const rows = await db.select({ id: files.id }).from(files).where(and(
    eq(files.userId, userId),
    isNotNull(files.deletedAt),
    fileIds ? inArray(files.id, fileIds) : undefined,
  ));
  if (fileIds && rows.length !== new Set(fileIds).size) throw notFound('Fichier');
  for (const row of rows) await deleteFile(userId, row.id);
  publishToUser(userId, { type: 'drive.changed' });
  return rows.length;
}

/** Tâche de maintenance : vide les fichiers mis à la corbeille il y a plus de `TRASH_RETENTION_DAYS` jours. */
export async function purgeExpiredTrash(now = new Date()): Promise<number> {
  const rows = await db.select({ id: files.id, userId: files.userId }).from(files)
    .where(lt(files.deletedAt, new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS)));
  for (const row of rows) await deleteFile(row.userId, row.id);
  return rows.length;
}

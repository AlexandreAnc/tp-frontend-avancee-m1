import type { FileCategory } from '@app/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { AppError, notFound } from '../utils/errors';
import { publishToUser } from './events';
import { deleteFile, listFiles, toFileDto, type StoredFile } from './files';

const { folders, files } = schema;

type FolderRow = typeof folders.$inferSelect;

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
}

const MAX_DEPTH = 10;

function cleanName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 120);
  if (!name) throw new AppError('validation', 'Le nom du dossier est vide');
  return name;
}

export async function listFolderTree(userId: string): Promise<FolderNode[]> {
  const rows = await db.select({ id: folders.id, name: folders.name, parentId: folders.parentId })
    .from(folders).where(eq(folders.userId, userId)).orderBy(folders.name);
  return rows;
}

/** Chemin d'un dossier depuis la racine (fil d'Ariane). */
export function pathOf(tree: FolderNode[], folderId: string | null): FolderNode[] {
  const byId = new Map(tree.map((folder) => [folder.id, folder]));
  const path: FolderNode[] = [];
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && path.length <= MAX_DEPTH) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function descendantsOf(tree: FolderNode[], folderId: string): Set<string> {
  const result = new Set<string>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of tree) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        added = true;
      }
    }
  }
  return result;
}

async function requireFolder(userId: string, folderId: string): Promise<FolderRow> {
  const [row] = await db.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  if (!row) throw notFound('Dossier');
  return row;
}

async function assertUniqueName(userId: string, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await db.select({ id: folders.id, name: folders.name }).from(folders)
    .where(and(eq(folders.userId, userId), parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)));
  if (siblings.some((sibling) => sibling.id !== exceptId && sibling.name.localeCompare(name, 'fr', { sensitivity: 'base' }) === 0)) {
    throw new AppError('conflict', `Un dossier « ${name} » existe déjà ici.`);
  }
}

function changed(userId: string) {
  publishToUser(userId, { type: 'drive.changed' });
}

export function toFolderDto(folder: FolderNode, stats: { fileCount: number; sizeBytes: number }) {
  return { id: folder.id, name: folder.name, parentId: folder.parentId, ...stats };
}

/**
 * Contenu d'un dossier : sous-dossiers (avec nombre de fichiers et taille cumulés) et fichiers.
 * Avec une recherche ou une catégorie, renvoie les fichiers correspondants de tout le drive.
 */
export async function browse(userId: string, options: { folderId: string | null; query?: string; category?: FileCategory }) {
  if (options.folderId) await requireFolder(userId, options.folderId);
  const [tree, allFiles] = await Promise.all([listFolderTree(userId), listFiles(userId)]);

  const pathLabel = (folderId: string | null) => pathOf(tree, folderId).map((folder) => folder.name).join(' / ');
  const withPath = (file: StoredFile) => ({ ...toFileDto(file), path: pathLabel(file.folderId) });

  const counts = new Map<FileCategory, number>();
  for (const file of allFiles) if (file.category) counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  const categories = [...counts].map(([name, count]) => ({ name, count }));
  const totalFiles = allFiles.length;

  const query = options.query?.trim().toLowerCase();
  if (query || options.category) {
    const matches = allFiles.filter((file) => (!options.category || file.category === options.category)
      && (!query || [file.name, file.analysis?.summary, file.analysis?.documentType, ...(file.analysis?.keyInfo.names ?? [])]
        .some((text) => text?.toLowerCase().includes(query))));
    return { folder: null, path: [], folders: [], files: matches.map(withPath), search: true, categories, totalFiles };
  }

  const children = tree.filter((folder) => folder.parentId === options.folderId);
  const folderStats = children.map((folder) => {
    const scope = descendantsOf(tree, folder.id);
    const contained = allFiles.filter((file) => file.folderId && scope.has(file.folderId));
    return toFolderDto(folder, { fileCount: contained.length, sizeBytes: contained.reduce((sum, file) => sum + file.sizeBytes, 0) });
  });

  const path = pathOf(tree, options.folderId);
  return {
    folder: path.at(-1) ?? null,
    path,
    folders: folderStats,
    files: allFiles.filter((file) => file.folderId === options.folderId).map(withPath),
    search: false,
    categories,
    totalFiles,
  };
}

export async function createFolder(userId: string, input: { name: string; parentId: string | null }) {
  const name = cleanName(input.name);
  if (input.parentId) {
    await requireFolder(userId, input.parentId);
    if (pathOf(await listFolderTree(userId), input.parentId).length >= MAX_DEPTH) {
      throw new AppError('validation', `Pas plus de ${MAX_DEPTH} niveaux de dossiers.`);
    }
  }
  await assertUniqueName(userId, input.parentId, name);
  const [row] = await db.insert(folders).values({ userId, name, parentId: input.parentId }).returning();
  changed(userId);
  return toFolderDto(row!, { fileCount: 0, sizeBytes: 0 });
}

export async function updateFolder(userId: string, folderId: string, input: { name?: string; parentId?: string | null }) {
  const current = await requireFolder(userId, folderId);
  const name = input.name !== undefined ? cleanName(input.name) : current.name;
  const parentId = input.parentId !== undefined ? input.parentId : current.parentId;

  if (parentId) {
    await requireFolder(userId, parentId);
    if (descendantsOf(await listFolderTree(userId), folderId).has(parentId)) {
      throw new AppError('validation', 'Impossible de déplacer un dossier dans lui-même ou dans un de ses sous-dossiers.');
    }
  }
  await assertUniqueName(userId, parentId, name, folderId);
  const [row] = await db.update(folders).set({ name, parentId }).where(eq(folders.id, folderId)).returning();
  changed(userId);
  return { id: row!.id, name: row!.name, parentId: row!.parentId };
}

/**
 * `keep` : le contenu (fichiers et sous-dossiers) remonte dans le dossier parent.
 * `all` : supprime aussi tous les fichiers contenus (et leurs données indexées).
 */
export async function deleteFolder(userId: string, folderId: string, mode: 'keep' | 'all'): Promise<{ deletedFiles: number }> {
  const folder = await requireFolder(userId, folderId);
  const scope = [...descendantsOf(await listFolderTree(userId), folderId)];

  if (mode === 'keep') {
    await db.transaction(async (tx) => {
      await tx.update(files).set({ folderId: folder.parentId }).where(and(eq(files.userId, userId), eq(files.folderId, folderId)));
      await tx.update(folders).set({ parentId: folder.parentId }).where(and(eq(folders.userId, userId), eq(folders.parentId, folderId)));
      await tx.delete(folders).where(eq(folders.id, folderId));
    });
    changed(userId);
    return { deletedFiles: 0 };
  }

  const contained = await db.select({ id: files.id }).from(files).where(and(eq(files.userId, userId), inArray(files.folderId, scope)));
  for (const file of contained) await deleteFile(userId, file.id);
  await db.delete(folders).where(eq(folders.id, folderId));
  changed(userId);
  return { deletedFiles: contained.length };
}

/** Déplace des fichiers (tous à l'utilisateur) dans un dossier, ou à la racine. */
export async function moveFiles(userId: string, fileIds: string[], folderId: string | null): Promise<number> {
  if (folderId) await requireFolder(userId, folderId);
  const moved = await db.update(files).set({ folderId })
    .where(and(eq(files.userId, userId), inArray(files.id, fileIds)))
    .returning({ id: files.id });
  if (moved.length !== new Set(fileIds).size) throw notFound('Fichier');
  changed(userId);
  return moved.length;
}

export async function renameFile(userId: string, fileId: string, rawName: string) {
  const name = rawName.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 255);
  if (!name) throw new AppError('validation', 'Le nom du fichier est vide');
  const [row] = await db.update(files).set({ name }).where(and(eq(files.id, fileId), eq(files.userId, userId))).returning();
  if (!row) throw notFound('Fichier');
  changed(userId);
  return toFileDto(row);
}

/** Dossier correspondant à un chemin (« Logement/2026 »), créé au besoin. */
export async function ensureFolderPath(userId: string, folderPath: string): Promise<string | null> {
  const segments = folderPath.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > MAX_DEPTH) throw new AppError('validation', `Pas plus de ${MAX_DEPTH} niveaux de dossiers.`);
  let parentId: string | null = null;
  for (const segment of segments) {
    const name = cleanName(segment);
    const tree = await listFolderTree(userId);
    const existing = tree.find((folder) => folder.parentId === parentId && folder.name.localeCompare(name, 'fr', { sensitivity: 'base' }) === 0);
    parentId = existing ? existing.id : (await createFolder(userId, { name, parentId })).id;
  }
  return parentId;
}

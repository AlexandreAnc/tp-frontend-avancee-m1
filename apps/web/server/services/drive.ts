import type { FileCategory } from '@app/shared';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, sum } from 'drizzle-orm';
import { db, schema } from '../db';
import { AppError, notFound } from '../utils/errors';
import { publishToUser } from './events';
import { activeFile, toFileDto, type StoredFile } from './files';
import { trashFiles } from './trash';

const { folders, files } = schema;

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  starred: boolean;
}

const MAX_DEPTH = 10;
const RECENT_LIMIT = 30;
const SEARCH_LIMIT = 50;

function cleanName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 120);
  if (!name) throw new AppError('validation', 'Le nom du dossier est vide');
  return name;
}

/** Clé d'unicité d'un nom de dossier : sans casse ni accents (« Impôts » = « impots »). */
export function folderNameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Violation de la contrainte d'unicité des noms (deux créations simultanées, par l'agent et l'utilisateur par exemple). */
function isDuplicateName(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
  return cause.code === '23505' && cause.constraint === 'folders_user_parent_name_key';
}

const duplicateName = (name: string) => new AppError('conflict', `Un dossier « ${name} » existe déjà ici.`);

export async function listFolderTree(userId: string): Promise<FolderNode[]> {
  return db.select({ id: folders.id, name: folders.name, parentId: folders.parentId, starred: folders.starred })
    .from(folders).where(eq(folders.userId, userId)).orderBy(folders.name);
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

export const pathLabel = (tree: FolderNode[], folderId: string | null) => pathOf(tree, folderId).map((folder) => folder.name).join(' / ');

export function descendantsOf(tree: FolderNode[], folderId: string): Set<string> {
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

async function requireFolder(userId: string, folderId: string) {
  const [row] = await db.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  if (!row) throw notFound('Dossier');
  return row;
}

function changed(userId: string) {
  publishToUser(userId, { type: 'drive.changed' });
}

type FolderStats = Map<string | null, { fileCount: number; sizeBytes: number }>;

/** Nombre de fichiers et taille par dossier direct, calculés par la base. */
async function statsByFolder(userId: string): Promise<FolderStats> {
  const rows = await db.select({ folderId: files.folderId, fileCount: count(), sizeBytes: sum(files.sizeBytes).mapWith(Number) })
    .from(files).where(and(eq(files.userId, userId), activeFile)).groupBy(files.folderId);
  return new Map(rows.map((row) => [row.folderId, { fileCount: row.fileCount, sizeBytes: row.sizeBytes }]));
}

/** Totaux d'un dossier, sous-dossiers compris. */
function totalsFor(tree: FolderNode[], stats: FolderStats, folderId: string) {
  let fileCount = 0;
  let sizeBytes = 0;
  for (const id of descendantsOf(tree, folderId)) {
    fileCount += stats.get(id)?.fileCount ?? 0;
    sizeBytes += stats.get(id)?.sizeBytes ?? 0;
  }
  return { fileCount, sizeBytes };
}

export function toFolderDto(folder: FolderNode, totals: { fileCount: number; sizeBytes: number }) {
  return { id: folder.id, name: folder.name, parentId: folder.parentId, starred: folder.starred, ...totals };
}

/**
 * Requête par préfixes sans racinisation : « loyers » → `loyer:*`. Ne garde que lettres et chiffres,
 * aucun opérateur de l'utilisateur n'atteint donc `to_tsquery`.
 */
export function prefixQuery(query: string): string | null {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((word) => (word.length > 3 ? word.replace(/[sx]$/, '') : word))
    .filter((word) => word.length >= 2)
    .slice(0, 8);
  return words.length ? words.map((word) => `${word}:*`).join(' & ') : null;
}

/** Correspondances de la recherche plein texte : meilleur extrait par fichier, mots trouvés entre \u0001 et \u0002. */
async function fullTextMatches(userId: string, query: string): Promise<Map<string, { rank: number; snippet: string }>> {
  const prefix = prefixQuery(query);
  if (!prefix) return new Map();
  const result = await db.execute<{ file_id: string; rank: number; snippet: string }>(sql`
    with q as (select websearch_to_tsquery('french', ${query}) as stemmed, to_tsquery('simple', ${prefix}) as prefix),
    matched as (
      select c.file_id, c.content,
        greatest(ts_rank(to_tsvector('french', c.content), q.stemmed), ts_rank(to_tsvector('simple', c.content), q.prefix)) as rank
      from ${schema.chunks} c
      join ${files} f on f.id = c.file_id and f.deleted_at is null, q
      where c.user_id = ${userId}
        and (to_tsvector('french', c.content) @@ q.stemmed or to_tsvector('simple', c.content) @@ q.prefix)
    ),
    ranked as (select *, row_number() over (partition by file_id order by rank desc) as position from matched)
    select r.file_id, r.rank, ts_headline('simple', r.content, q.prefix,
      'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxWords=28, MinWords=12, MaxFragments=1') as snippet
    from ranked r, q where r.position = 1
    order by r.rank desc limit ${SEARCH_LIMIT}
  `);
  return new Map(result.rows.map((row) => [row.file_id, { rank: Number(row.rank), snippet: row.snippet }]));
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

export type DriveView = 'folder' | 'recent' | 'starred';

/**
 * Contenu d'un dossier (racine par défaut) : sous-dossiers avec leurs totaux et fichiers.
 * Avec une recherche ou une catégorie : fichiers correspondants de tout le drive, avec leur chemin
 * et, pour la recherche, l'extrait du document où les mots apparaissent.
 */
export async function browse(userId: string, options: { folderId: string | null; view?: DriveView; query?: string; category?: FileCategory }) {
  if (options.folderId) await requireFolder(userId, options.folderId);
  const [tree, stats, categoryRows] = await Promise.all([
    listFolderTree(userId),
    statsByFolder(userId),
    db.select({ name: files.category, count: count() }).from(files)
      .where(and(eq(files.userId, userId), activeFile, sql`${files.category} is not null`)).groupBy(files.category),
  ]);
  const categories = categoryRows.map((row) => ({ name: row.name!, count: row.count }));
  const totalFiles = [...stats.values()].reduce((total, entry) => total + entry.fileCount, 0);
  const withPath = (file: StoredFile, snippet: string | null = null) => ({ ...toFileDto(file), path: pathLabel(tree, file.folderId), snippet });
  const folderDto = (folder: FolderNode) => toFolderDto(folder, totalsFor(tree, stats, folder.id));
  const base = { categories, totalFiles };
  const owned = and(eq(files.userId, userId), activeFile);

  const query = options.query?.trim();
  if (query || options.category) {
    const text = query ? await fullTextMatches(userId, query) : new Map<string, { rank: number; snippet: string }>();
    const like = query ? `%${escapeLike(query)}%` : null;
    const rows = await db.select().from(files).where(and(
      owned,
      options.category ? eq(files.category, options.category) : undefined,
      like ? or(
        ilike(files.name, like),
        sql`${files.analysis}->>'summary' ilike ${like}`,
        sql`${files.analysis}->>'documentType' ilike ${like}`,
        sql`(${files.analysis}->'keyInfo'->'names')::text ilike ${like}`,
        text.size ? inArray(files.id, [...text.keys()]) : undefined,
      ) : undefined,
    )).orderBy(desc(files.createdAt)).limit(SEARCH_LIMIT);

    // Les noms de fichier correspondants d'abord, puis par pertinence du contenu.
    const lower = query?.toLowerCase() ?? '';
    const score = (file: StoredFile) => (lower && file.name.toLowerCase().includes(lower) ? 10 : 0) + (text.get(file.id)?.rank ?? 0);
    const sorted = query ? [...rows].sort((a, b) => score(b) - score(a)) : rows;
    const matchingFolders = query && !options.category
      ? tree.filter((folder) => folderNameKey(folder.name).includes(folderNameKey(query))).slice(0, 10).map(folderDto)
      : [];
    return {
      ...base,
      view: 'search' as const,
      folder: null,
      path: [],
      folders: matchingFolders,
      files: sorted.map((file) => withPath(file, text.get(file.id)?.snippet ?? null)),
    };
  }

  if (options.view === 'recent') {
    const rows = await db.select().from(files).where(owned).orderBy(desc(files.createdAt)).limit(RECENT_LIMIT);
    return { ...base, view: 'recent' as const, folder: null, path: [], folders: [], files: rows.map((file) => withPath(file)) };
  }

  if (options.view === 'starred') {
    const rows = await db.select().from(files).where(and(owned, eq(files.starred, true))).orderBy(files.name);
    return {
      ...base,
      view: 'starred' as const,
      folder: null,
      path: [],
      folders: tree.filter((folder) => folder.starred).map(folderDto),
      files: rows.map((file) => withPath(file)),
    };
  }

  const rows = await db.select().from(files)
    .where(and(owned, options.folderId ? eq(files.folderId, options.folderId) : isNull(files.folderId)))
    .orderBy(desc(files.createdAt));
  const path = pathOf(tree, options.folderId);
  return {
    ...base,
    view: 'folder' as const,
    folder: path.at(-1) ?? null,
    path,
    folders: tree.filter((folder) => folder.parentId === options.folderId).map(folderDto),
    files: rows.map((file) => withPath(file)),
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
  try {
    const [row] = await db.insert(folders).values({ userId, name, nameKey: folderNameKey(name), parentId: input.parentId }).returning();
    changed(userId);
    return toFolderDto(row!, { fileCount: 0, sizeBytes: 0 });
  } catch (error) {
    if (isDuplicateName(error)) throw duplicateName(name);
    throw error;
  }
}

export async function updateFolder(userId: string, folderId: string, input: { name?: string; parentId?: string | null; starred?: boolean }) {
  const current = await requireFolder(userId, folderId);
  const name = input.name !== undefined ? cleanName(input.name) : current.name;
  const parentId = input.parentId !== undefined ? input.parentId : current.parentId;

  if (parentId && parentId !== current.parentId) {
    await requireFolder(userId, parentId);
    if (descendantsOf(await listFolderTree(userId), folderId).has(parentId)) {
      throw new AppError('validation', 'Impossible de déplacer un dossier dans lui-même ou dans un de ses sous-dossiers.');
    }
  }
  if (parentId === folderId) throw new AppError('validation', 'Impossible de déplacer un dossier dans lui-même ou dans un de ses sous-dossiers.');
  try {
    const [row] = await db.update(folders)
      .set({ name, nameKey: folderNameKey(name), parentId, ...(input.starred !== undefined ? { starred: input.starred } : {}) })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();
    changed(userId);
    return { id: row!.id, name: row!.name, parentId: row!.parentId, starred: row!.starred };
  } catch (error) {
    if (isDuplicateName(error)) throw duplicateName(name);
    throw error;
  }
}

/**
 * `keep` : le contenu (fichiers et sous-dossiers) remonte dans le dossier parent.
 * `all` : les fichiers contenus, sous-dossiers compris, partent à la corbeille (restaurables avec leur chemin).
 */
export async function deleteFolder(userId: string, folderId: string, mode: 'keep' | 'all'): Promise<{ trashedFiles: number }> {
  const folder = await requireFolder(userId, folderId);

  if (mode === 'keep') {
    await db.transaction(async (tx) => {
      await tx.update(files).set({ folderId: folder.parentId }).where(and(eq(files.userId, userId), eq(files.folderId, folderId)));
      await tx.update(folders).set({ parentId: folder.parentId }).where(and(eq(folders.userId, userId), eq(folders.parentId, folderId)));
      await tx.delete(folders).where(eq(folders.id, folderId));
    }).catch((error: unknown) => {
      // Un sous-dossier porte le nom d'un dossier du niveau supérieur : la contrainte d'unicité l'empêche de remonter.
      if (isDuplicateName(error)) throw new AppError('conflict', 'Un sous-dossier porte le même nom qu’un dossier du niveau supérieur : renommez-le d’abord.');
      throw error;
    });
    changed(userId);
    return { trashedFiles: 0 };
  }

  const scope = [...descendantsOf(await listFolderTree(userId), folderId)];
  const contained = await db.select({ id: files.id }).from(files)
    .where(and(eq(files.userId, userId), activeFile, inArray(files.folderId, scope)));
  if (contained.length) await trashFiles(userId, contained.map((file) => file.id));
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  changed(userId);
  return { trashedFiles: contained.length };
}

/** Déplace des fichiers (tous à l'utilisateur, hors corbeille) dans un dossier, ou à la racine. */
export async function moveFiles(userId: string, fileIds: string[], folderId: string | null): Promise<number> {
  if (folderId) await requireFolder(userId, folderId);
  const moved = await db.update(files).set({ folderId })
    .where(and(eq(files.userId, userId), activeFile, inArray(files.id, fileIds)))
    .returning({ id: files.id });
  if (moved.length !== new Set(fileIds).size) throw notFound('Fichier');
  changed(userId);
  return moved.length;
}

export async function updateFileMeta(userId: string, fileId: string, input: { name?: string; starred?: boolean }) {
  const name = input.name?.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 255);
  if (input.name !== undefined && !name) throw new AppError('validation', 'Le nom du fichier est vide');
  const [row] = await db.update(files).set({ ...(name ? { name } : {}), ...(input.starred !== undefined ? { starred: input.starred } : {}) })
    .where(and(eq(files.id, fileId), eq(files.userId, userId), activeFile)).returning();
  if (!row) throw notFound('Fichier');
  changed(userId);
  return toFileDto(row);
}

/** Dossier correspondant à un chemin (« Logement/2026 »), créé au besoin. Sûr en cas de créations simultanées. */
export async function ensureFolderPath(userId: string, folderPath: string): Promise<string | null> {
  const segments = folderPath.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > MAX_DEPTH) throw new AppError('validation', `Pas plus de ${MAX_DEPTH} niveaux de dossiers.`);
  let parentId: string | null = null;
  for (const segment of segments) {
    const name = cleanName(segment);
    const find = async () => {
      const [row] = await db.select({ id: folders.id }).from(folders).where(and(
        eq(folders.userId, userId),
        parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
        eq(folders.nameKey, folderNameKey(name)),
      ));
      return row?.id;
    };
    let id = await find();
    if (!id) {
      const [row]: { id: string }[] = await db.insert(folders).values({ userId, name, nameKey: folderNameKey(name), parentId })
        .onConflictDoNothing().returning({ id: folders.id });
      if (row) changed(userId);
      id = row?.id ?? await find();
    }
    if (!id) throw new AppError('conflict', `Impossible de créer le dossier « ${name} ».`);
    parentId = id;
  }
  return parentId;
}

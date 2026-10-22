import { createHash, randomBytes } from 'node:crypto';
import type { ShareLinkDuration } from '@app/shared';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { notFound } from '../utils/errors';
import { getFile } from './files';
import { openStoredFile } from './storage';

const { shareLinks, files } = schema;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function toShareDto(link: typeof shareLinks.$inferSelect) {
  return {
    id: link.id,
    expiresAt: link.expiresAt.toISOString(),
    downloadCount: link.downloadCount,
    lastDownloadAt: link.lastDownloadAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}

/**
 * Crée un lien de téléchargement temporaire. Le jeton (256 bits) n'est renvoyé qu'une fois :
 * seul son hash est stocké, une fuite de la base ne donne donc accès à aucun fichier.
 */
export async function createShareLink(userId: string, fileId: string, hours: ShareLinkDuration) {
  await getFile(userId, fileId);
  const token = randomBytes(32).toString('base64url');
  const [link] = await db.insert(shareLinks).values({
    userId,
    fileId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  }).returning();
  return { token, link: toShareDto(link!) };
}

/** Liens encore valides d'un fichier. */
export async function listShareLinks(userId: string, fileId: string) {
  await getFile(userId, fileId);
  const rows = await db.select().from(shareLinks).where(and(
    eq(shareLinks.userId, userId),
    eq(shareLinks.fileId, fileId),
    isNull(shareLinks.revokedAt),
    gt(shareLinks.expiresAt, new Date()),
  )).orderBy(desc(shareLinks.createdAt));
  return rows.map(toShareDto);
}

export async function revokeShareLink(userId: string, linkId: string) {
  const [row] = await db.update(shareLinks).set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
    .returning({ id: shareLinks.id });
  if (!row) throw notFound('Lien');
}

/** Lien valide (non révoqué, non expiré, fichier hors corbeille), ou 404 sans distinguer la cause. */
async function resolve(token: string) {
  if (!/^[\w-]{43}$/.test(token)) throw notFound('Lien');
  const [row] = await db.select({ link: shareLinks, file: files }).from(shareLinks)
    .innerJoin(files, eq(files.id, shareLinks.fileId))
    .where(and(
      eq(shareLinks.tokenHash, hashToken(token)),
      isNull(shareLinks.revokedAt),
      gt(shareLinks.expiresAt, new Date()),
      isNull(files.deletedAt),
    ));
  if (!row) throw notFound('Lien');
  return row;
}

/** Informations affichées sur la page publique du lien (nom, taille, expiration : rien d'autre). */
export async function describeShareLink(token: string) {
  const { link, file } = await resolve(token);
  return { name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, expiresAt: link.expiresAt.toISOString() };
}

export async function openSharedFile(token: string) {
  const { link, file } = await resolve(token);
  await db.update(shareLinks)
    .set({ downloadCount: sql`${shareLinks.downloadCount} + 1`, lastDownloadAt: new Date() })
    .where(eq(shareLinks.id, link.id));
  return { file, stream: openStoredFile(file.storageKey) };
}

/** Maintenance : supprime les liens expirés ou révoqués depuis plus d'une semaine. */
export async function purgeExpiredShareLinks(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await db.delete(shareLinks).where(or(lt(shareLinks.expiresAt, weekAgo), lt(shareLinks.revokedAt, weekAgo)));
}

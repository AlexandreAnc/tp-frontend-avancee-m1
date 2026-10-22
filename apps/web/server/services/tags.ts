import type { RoutineIcon } from '@app/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateToken } from '../utils/crypto';
import { notFound } from '../utils/errors';
import { getRoutine, runRoutine, toRoutineDto } from './routines';

const { nfcTags, routines } = schema;

type TagRow = typeof nfcTags.$inferSelect;

export function toTagDto(row: TagRow, routineName: string | null = null) {
  return {
    id: row.id,
    publicId: row.publicId,
    name: row.name,
    icon: row.icon,
    routineId: row.routineId,
    routineName,
    scanCount: row.scanCount,
    lastScanAt: row.lastScanAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTags(userId: string) {
  const rows = await db.select({ tag: nfcTags, routineName: routines.name }).from(nfcTags)
    .leftJoin(routines, eq(routines.id, nfcTags.routineId))
    .where(and(eq(nfcTags.userId, userId), isNull(nfcTags.revokedAt)))
    .orderBy(desc(nfcTags.createdAt));
  return rows.map(({ tag, routineName }) => toTagDto(tag, routineName));
}

export async function createTag(userId: string, input: { name: string; icon: RoutineIcon; routineId: string | null }) {
  if (input.routineId) await getRoutine(userId, input.routineId);
  // 128 bits d'aléa : l'URL d'un tag ne se devine pas.
  const [row] = await db.insert(nfcTags).values({ userId, publicId: generateToken().slice(0, 22), ...input }).returning();
  return toTagDto(row!);
}

export async function updateTag(userId: string, tagId: string, input: { name?: string; icon?: RoutineIcon; routineId?: string | null }) {
  if (input.routineId) await getRoutine(userId, input.routineId);
  const [row] = await db.update(nfcTags).set(input)
    .where(and(eq(nfcTags.id, tagId), eq(nfcTags.userId, userId), isNull(nfcTags.revokedAt))).returning();
  if (!row) throw notFound('Tag');
  return toTagDto(row);
}

/** Un tag révoqué n'exécute plus rien, même si quelqu'un a copié son URL. */
export async function revokeTag(userId: string, tagId: string): Promise<void> {
  const [row] = await db.update(nfcTags).set({ revokedAt: new Date() })
    .where(and(eq(nfcTags.id, tagId), eq(nfcTags.userId, userId), isNull(nfcTags.revokedAt))).returning({ id: nfcTags.id });
  if (!row) throw notFound('Tag');
}

async function requireActiveTag(userId: string, publicId: string) {
  const [tag] = await db.select().from(nfcTags)
    .where(and(eq(nfcTags.publicId, publicId), eq(nfcTags.userId, userId), isNull(nfcTags.revokedAt)));
  if (!tag) throw notFound('Tag');
  return tag;
}

/** Aperçu affiché à l'ouverture du tag (avant le lancement automatique). */
export async function previewTag(userId: string, publicId: string) {
  const tag = await requireActiveTag(userId, publicId);
  const routine = tag.routineId ? toRoutineDto(await getRoutine(userId, tag.routineId)) : null;
  return { tag: toTagDto(tag, routine?.name ?? null), routine };
}

/** Tap sur un tag : compte le scan et lance la routine associée. */
export async function scanTag(userId: string, publicId: string) {
  const tag = await requireActiveTag(userId, publicId);
  await db.update(nfcTags).set({ scanCount: sql`${nfcTags.scanCount} + 1`, lastScanAt: new Date() }).where(eq(nfcTags.id, tag.id));
  if (!tag.routineId) return { run: null };
  return { run: await runRoutine(userId, tag.routineId, 'tag', tag.name) };
}

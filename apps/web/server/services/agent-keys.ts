import { AGENT_KEY_PREFIX } from '@app/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { generateToken, hashToken } from '../utils/crypto';
import { AppError, notFound } from '../utils/errors';

const { agentKeys } = schema;

export function toAgentKeyDto(row: typeof agentKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    chatModel: row.chatModel,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Crée une clé pour une machine. La clé en clair n'est renvoyée qu'une seule fois. */
export async function createAgentKey(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('validation', 'Le nom de la machine est requis');
  const key = generateToken(AGENT_KEY_PREFIX);
  const [row] = await db.insert(agentKeys).values({
    name: trimmed,
    keyHash: hashToken(key),
    keyPrefix: key.slice(0, AGENT_KEY_PREFIX.length + 6),
  }).returning();
  return { key, agentKey: toAgentKeyDto(row!) };
}

export async function listAgentKeys() {
  const rows = await db.select().from(agentKeys).orderBy(desc(agentKeys.createdAt));
  return rows.map(toAgentKeyDto);
}

export async function revokeAgentKey(id: string) {
  const [row] = await db.update(agentKeys).set({ revokedAt: new Date() })
    .where(and(eq(agentKeys.id, id), isNull(agentKeys.revokedAt)))
    .returning();
  if (!row) throw notFound("Clé d'agent active");
  return toAgentKeyDto(row);
}

/** Renvoie la clé active correspondante, ou `null` si elle est inconnue ou révoquée. */
export async function verifyAgentKey(key: string) {
  const [row] = await db.select().from(agentKeys)
    .where(and(eq(agentKeys.keyHash, hashToken(key)), isNull(agentKeys.revokedAt)));
  return row ?? null;
}

export async function touchAgentKey(id: string): Promise<void> {
  await db.update(agentKeys).set({ lastSeenAt: new Date() }).where(eq(agentKeys.id, id));
}

export async function setAgentKeyChatModel(id: string, chatModel: string | null): Promise<void> {
  await db.update(agentKeys).set({ chatModel }).where(eq(agentKeys.id, id));
}

export async function isAgentKeyActive(id: string): Promise<boolean> {
  const [row] = await db.select({ id: agentKeys.id }).from(agentKeys)
    .where(and(eq(agentKeys.id, id), isNull(agentKeys.revokedAt)));
  return Boolean(row);
}

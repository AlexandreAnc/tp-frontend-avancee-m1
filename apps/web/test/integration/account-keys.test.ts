import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGENT_KEY_PREFIX } from '@app/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { hashToken } from '../../server/utils/crypto';
import { createUser, sampleAnalysis, skipDb, textStream } from './helpers';

const cancelTasksFor = vi.fn();
vi.mock('../../server/services/tasks', () => ({ enqueueTask: vi.fn(async () => 'job'), cancelTasksFor: (subject: unknown) => cancelTasksFor(subject) }));
vi.mock('../../server/jobs/boss', () => ({ getBoss: async () => ({ send: async () => 'job' }) }));

const { deleteAccount, exportAccount } = await import('../../server/services/account');
const agentKeys = await import('../../server/services/agent-keys');
const { uploadFile, saveFileIndex } = await import('../../server/services/files');
const { createReminder } = await import('../../server/services/reminders');

const storedPath = (storageKey: string) => join(resolve(process.env.STORAGE_DIR!), storageKey);

/** Un compte avec un document analysé, une discussion et un rappel. */
async function populatedAccount(name: string) {
  const userId = await createUser(name);
  const file = await uploadFile(userId, { fileName: `${name}.txt`, stream: textStream(`Bail de ${name}`) });
  await saveFileIndex(userId, file.id, { embedModel: 'bge-m3', text: 'Bail', chunks: [], analysis: sampleAnalysis });
  const [conversation] = await db.insert(schema.conversations).values({ userId, title: `Discussion de ${name}` }).returning();
  await db.insert(schema.messages).values([
    { userId, conversationId: conversation!.id, role: 'user', content: 'Question' },
    { userId, conversationId: conversation!.id, role: 'assistant', content: 'Réponse' },
  ]);
  await createReminder(userId, { text: `Loyer de ${name}`, remindAt: new Date(Date.now() + 3_600_000), source: 'user' });
  const [row] = await db.select({ storageKey: schema.files.storageKey }).from(schema.files).where(eq(schema.files.id, file.id));
  return { userId, storageKey: row!.storageKey };
}

describe.skipIf(skipDb)('compte : export et suppression', () => {
  it("exporte toutes les données de l'utilisateur, et seulement les siennes", async () => {
    const alice = await populatedAccount('Alice');
    await populatedAccount('Bob');

    const data = await exportAccount(alice.userId);
    expect(data.profile).toMatchObject({ name: 'Alice' });
    expect(data.files).toEqual([expect.objectContaining({ name: 'Alice.txt', analysis: sampleAnalysis })]);
    expect(data.conversations).toEqual([expect.objectContaining({
      title: 'Discussion de Alice',
      messages: [expect.objectContaining({ role: 'user', content: 'Question' }), expect.objectContaining({ role: 'assistant', content: 'Réponse' })],
    })]);
    expect(data.reminders).toEqual([expect.objectContaining({ text: 'Loyer de Alice' })]);
    expect(JSON.stringify(data)).not.toContain('Bob');
    // Aucun secret technique dans l'export (clés de stockage, hash de token…).
    expect(JSON.stringify(data)).not.toContain(alice.storageKey);
  });

  it('supprime le compte, ses fichiers sur le disque et ses tâches, sans toucher aux autres', async () => {
    const alice = await populatedAccount('Alice');
    const bob = await populatedAccount('Bob');
    expect(existsSync(storedPath(alice.storageKey))).toBe(true);

    await deleteAccount(alice.userId);

    expect(cancelTasksFor).toHaveBeenCalledWith({ userId: alice.userId, all: true });
    expect(existsSync(storedPath(alice.storageKey))).toBe(false);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, alice.userId))).toEqual([]);
    expect(await db.select().from(schema.files).where(eq(schema.files.userId, alice.userId))).toEqual([]);
    expect(await db.select().from(schema.messages).where(eq(schema.messages.userId, alice.userId))).toEqual([]);
    expect(existsSync(storedPath(bob.storageKey))).toBe(true);
    expect((await exportAccount(bob.userId)).files).toHaveLength(1);
  });
});

describe.skipIf(skipDb)("clés d'agent", () => {
  it("ne stocke que le hash de la clé, renvoyée en clair une seule fois", async () => {
    const { key, agentKey } = await agentKeys.createAgentKey('  Mac mini  ');
    expect(key.startsWith(AGENT_KEY_PREFIX)).toBe(true);
    expect(agentKey).toMatchObject({ name: 'Mac mini', keyPrefix: key.slice(0, AGENT_KEY_PREFIX.length + 6), revokedAt: null, lastSeenAt: null });
    const [row] = await db.select().from(schema.agentKeys).where(eq(schema.agentKeys.id, agentKey.id));
    expect(row!.keyHash).toBe(hashToken(key));
    expect(JSON.stringify(row)).not.toContain(key);
    expect((await agentKeys.listAgentKeys()).find((entry) => entry.id === agentKey.id)).not.toHaveProperty('keyHash');
  });

  it('exige un nom de machine', async () => {
    await expect(agentKeys.createAgentKey('   ')).rejects.toMatchObject({ code: 'validation' });
  });

  it("authentifie une clé active, enregistre l'activité et le modèle de chat", async () => {
    const { key, agentKey } = await agentKeys.createAgentKey('PC salon');
    expect((await agentKeys.verifyAgentKey(key))?.id).toBe(agentKey.id);
    expect(await agentKeys.verifyAgentKey(`${key}x`)).toBeNull();

    await agentKeys.touchAgentKey(agentKey.id);
    await agentKeys.setAgentKeyChatModel(agentKey.id, 'qwen3:8b');
    const listed = (await agentKeys.listAgentKeys()).find((entry) => entry.id === agentKey.id);
    expect(listed).toMatchObject({ chatModel: 'qwen3:8b', lastSeenAt: expect.any(String) });
  });

  it('révoque une clé une seule fois : elle ne permet plus de se connecter', async () => {
    const { key, agentKey } = await agentKeys.createAgentKey('Portable');
    expect(await agentKeys.isAgentKeyActive(agentKey.id)).toBe(true);

    expect((await agentKeys.revokeAgentKey(agentKey.id)).revokedAt).toEqual(expect.any(String));
    expect(await agentKeys.verifyAgentKey(key)).toBeNull();
    expect(await agentKeys.isAgentKeyActive(agentKey.id)).toBe(false);
    await expect(agentKeys.revokeAgentKey(agentKey.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

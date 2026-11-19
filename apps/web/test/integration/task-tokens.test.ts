import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '../../server/db';
import { issueTaskToken, purgeOldTaskTokens, revokeTaskTokens, verifyTaskToken } from '../../server/services/task-tokens';
import { createUser, skipDb } from './helpers';

describe.skipIf(skipDb)('tokens de tâche', () => {
  it('donne accès au seul utilisateur concerné, jusqu’à la fin de la tâche', async () => {
    const userId = await createUser();
    const token = await issueTaskToken({ userId, taskId: 'job-1', taskType: 'chat.reply', conversationId: null });

    await expect(verifyTaskToken(token, ['chat.reply'])).resolves.toMatchObject({ userId, taskId: 'job-1' });
    await revokeTaskTokens('job-1');
    await expect(verifyTaskToken(token, ['chat.reply'])).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('n’ouvre que les routes de son type de tâche : un token d’indexation ne propose pas d’action', async () => {
    const userId = await createUser();
    const token = await issueTaskToken({ userId, taskId: 'job-index', taskType: 'file.index', conversationId: null });
    await expect(verifyTaskToken(token, ['file.index'])).resolves.toMatchObject({ taskType: 'file.index' });
    await expect(verifyTaskToken(token, ['chat.reply'])).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('expire après sa durée de vie', async () => {
    const userId = await createUser();
    const token = await issueTaskToken({ userId, taskId: 'job-2', taskType: 'chat.reply', conversationId: null });
    await db.update(schema.taskTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.taskTokens.taskId, 'job-2'));
    await expect(verifyTaskToken(token, ['chat.reply'])).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('purge les tokens expirés ou révoqués depuis plus d’un jour, et garde les autres', async () => {
    const userId = await createUser();
    const dayAndMore = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await issueTaskToken({ userId, taskId: 'job-old-expired', taskType: 'chat.reply', conversationId: null });
    await issueTaskToken({ userId, taskId: 'job-old-revoked', taskType: 'chat.reply', conversationId: null });
    const active = await issueTaskToken({ userId, taskId: 'job-active', taskType: 'chat.reply', conversationId: null });
    await db.update(schema.taskTokens).set({ expiresAt: dayAndMore }).where(eq(schema.taskTokens.taskId, 'job-old-expired'));
    await db.update(schema.taskTokens).set({ revokedAt: dayAndMore }).where(eq(schema.taskTokens.taskId, 'job-old-revoked'));

    await purgeOldTaskTokens();
    const remaining = (await db.select().from(schema.taskTokens).where(eq(schema.taskTokens.userId, userId))).map((row) => row.taskId);
    expect(remaining).toEqual(['job-active']);
    await expect(verifyTaskToken(active, ['chat.reply'])).resolves.toMatchObject({ userId });
  });
});

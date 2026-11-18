import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '../../server/db';
import { issueTaskToken, purgeOldTaskTokens, revokeTaskTokens, verifyTaskToken } from '../../server/services/task-tokens';
import { createUser, skipDb } from './helpers';

describe.skipIf(skipDb)('tokens de tâche', () => {
  it('donne accès au seul utilisateur concerné, jusqu’à la fin de la tâche', async () => {
    const userId = await createUser();
    const token = await issueTaskToken({ userId, taskId: 'job-1', conversationId: null });

    await expect(verifyTaskToken(token)).resolves.toMatchObject({ userId, taskId: 'job-1' });
    await revokeTaskTokens('job-1');
    await expect(verifyTaskToken(token)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('expire après sa durée de vie', async () => {
    const userId = await createUser();
    const token = await issueTaskToken({ userId, taskId: 'job-2', conversationId: null });
    await db.update(schema.taskTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.taskTokens.taskId, 'job-2'));
    await expect(verifyTaskToken(token)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('purge les tokens expirés ou révoqués depuis plus d’un jour, et garde les autres', async () => {
    const userId = await createUser();
    const dayAndMore = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await issueTaskToken({ userId, taskId: 'job-old-expired', conversationId: null });
    await issueTaskToken({ userId, taskId: 'job-old-revoked', conversationId: null });
    const active = await issueTaskToken({ userId, taskId: 'job-active', conversationId: null });
    await db.update(schema.taskTokens).set({ expiresAt: dayAndMore }).where(eq(schema.taskTokens.taskId, 'job-old-expired'));
    await db.update(schema.taskTokens).set({ revokedAt: dayAndMore }).where(eq(schema.taskTokens.taskId, 'job-old-revoked'));

    await purgeOldTaskTokens();
    const remaining = (await db.select().from(schema.taskTokens).where(eq(schema.taskTokens.userId, userId))).map((row) => row.taskId);
    expect(remaining).toEqual(['job-active']);
    await expect(verifyTaskToken(active)).resolves.toMatchObject({ userId });
  });
});

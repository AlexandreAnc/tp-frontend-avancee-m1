import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '../../server/db';
import { issueTaskToken, revokeTaskTokens, verifyTaskToken } from '../../server/services/task-tokens';
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
});

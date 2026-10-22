import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { removeAllStoredFiles } from './files';
import { cancelTasksFor } from './tasks';

/**
 * Export des données de l'utilisateur (portabilité) : profil, documents analysés, discussions,
 * rappels, actions et journal. Les fichiers originaux restent téléchargeables depuis le drive.
 */
export async function exportAccount(userId: string) {
  const [profile] = await db.select({ name: schema.user.name, email: schema.user.email, createdAt: schema.user.createdAt })
    .from(schema.user).where(eq(schema.user.id, userId));
  const [files, conversations, messages, reminders, actions, activity] = await Promise.all([
    db.select({ name: schema.files.name, mimeType: schema.files.mimeType, sizeBytes: schema.files.sizeBytes, category: schema.files.category, analysis: schema.files.analysis, createdAt: schema.files.createdAt })
      .from(schema.files).where(eq(schema.files.userId, userId)),
    db.select({ id: schema.conversations.id, title: schema.conversations.title, createdAt: schema.conversations.createdAt })
      .from(schema.conversations).where(eq(schema.conversations.userId, userId)),
    db.select({ conversationId: schema.messages.conversationId, role: schema.messages.role, content: schema.messages.content, createdAt: schema.messages.createdAt })
      .from(schema.messages).where(eq(schema.messages.userId, userId)).orderBy(asc(schema.messages.createdAt)),
    db.select({ text: schema.reminders.text, remindAt: schema.reminders.remindAt, status: schema.reminders.status })
      .from(schema.reminders).where(eq(schema.reminders.userId, userId)),
    db.select({ type: schema.pendingActions.type, summary: schema.pendingActions.summary, status: schema.pendingActions.status, payload: schema.pendingActions.payload, createdAt: schema.pendingActions.createdAt })
      .from(schema.pendingActions).where(eq(schema.pendingActions.userId, userId)),
    db.select({ type: schema.activityLog.type, summary: schema.activityLog.summary, status: schema.activityLog.status, trigger: schema.activityLog.trigger, createdAt: schema.activityLog.createdAt })
      .from(schema.activityLog).where(eq(schema.activityLog.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile,
    files,
    conversations: conversations.map((conversation) => ({ ...conversation, messages: messages.filter((message) => message.conversationId === conversation.id) })),
    reminders,
    actions,
    activity,
  };
}

/** Supprime le compte et toutes ses données : fichiers stockés, puis lignes en base (cascade). */
export async function deleteAccount(userId: string): Promise<void> {
  cancelTasksFor({ userId, all: true });
  await removeAllStoredFiles(userId);
  await db.delete(schema.user).where(eq(schema.user.id, userId));
}

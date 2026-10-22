import { type ReminderStatus } from '@app/shared';
import { and, asc, eq, gte, isNull, lt, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import type { ReminderSource } from '../db/schema';
import { getBoss } from '../jobs/boss';
import { REMINDER_QUEUE, type ReminderJobData } from '../jobs/queues';
import { AppError, notFound } from '../utils/errors';
import { publishToUser } from './events';
import { sendToUser } from './push';

const { reminders, files } = schema;

type ReminderRow = typeof reminders.$inferSelect;

export function toReminderDto(row: ReminderRow) {
  return {
    id: row.id,
    text: row.text,
    remindAt: row.remindAt.toISOString(),
    status: row.status,
    source: row.source,
    fileId: row.fileId,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ReminderDto = ReturnType<typeof toReminderDto>;

const SNOOZE_MAX_MINUTES = 7 * 24 * 60;

async function schedule(row: ReminderRow): Promise<void> {
  const data: ReminderJobData = { reminderId: row.id, remindAt: row.remindAt.toISOString() };
  await (await getBoss()).send(REMINDER_QUEUE, data, { startAfter: row.remindAt });
}

function publish(row: ReminderRow) {
  publishToUser(row.userId, { type: 'reminder.updated', reminderId: row.id, status: row.status });
}

async function assertOwnFile(userId: string, fileId: string | undefined) {
  if (!fileId) return;
  const [file] = await db.select({ id: files.id }).from(files).where(and(eq(files.id, fileId), eq(files.userId, userId), isNull(files.deletedAt)));
  if (!file) throw notFound('Document');
}

export async function createReminder(userId: string, input: {
  text: string;
  remindAt: string | Date;
  fileId?: string;
  source: ReminderSource;
}): Promise<ReminderDto> {
  const remindAt = new Date(input.remindAt);
  if (remindAt.getTime() < Date.now() - 60_000) throw new AppError('validation', 'Le rappel doit être dans le futur');
  await assertOwnFile(userId, input.fileId);

  const [row] = await db.insert(reminders).values({
    userId,
    text: input.text.trim(),
    remindAt,
    source: input.source,
    fileId: input.fileId ?? null,
  }).returning();
  await schedule(row!);
  publish(row!);
  return toReminderDto(row!);
}

export async function listReminders(userId: string, range?: { from: Date; to: Date }) {
  const rows = await db.select().from(reminders).where(and(
    eq(reminders.userId, userId),
    ne(reminders.status, 'cancelled'),
    range ? gte(reminders.remindAt, range.from) : undefined,
    range ? lt(reminders.remindAt, range.to) : undefined,
  )).orderBy(asc(reminders.remindAt));
  return rows.map(toReminderDto);
}

async function requireReminder(userId: string, reminderId: string) {
  const [row] = await db.select().from(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
  if (!row) throw notFound('Rappel');
  return row;
}

export async function updateReminder(userId: string, reminderId: string, input: {
  text?: string;
  remindAt?: string;
  status?: Extract<ReminderStatus, 'done' | 'scheduled'>;
}): Promise<ReminderDto> {
  const current = await requireReminder(userId, reminderId);
  if (current.status === 'cancelled') throw new AppError('conflict', 'Ce rappel a été supprimé');

  const remindAt = input.remindAt ? new Date(input.remindAt) : undefined;
  const rescheduled = remindAt && remindAt.getTime() !== current.remindAt.getTime();
  const [row] = await db.update(reminders).set({
    text: input.text?.trim() ?? current.text,
    remindAt: remindAt ?? current.remindAt,
    // Un rappel reprogrammé repart à zéro, même s'il avait déjà été envoyé.
    status: input.status ?? (rescheduled ? 'scheduled' : current.status),
    sentAt: rescheduled ? null : current.sentAt,
  }).where(eq(reminders.id, reminderId)).returning();

  if (rescheduled && row!.status === 'scheduled') await schedule(row!);
  publish(row!);
  return toReminderDto(row!);
}

export async function snoozeReminder(userId: string, reminderId: string, minutes: number): Promise<ReminderDto> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > SNOOZE_MAX_MINUTES) {
    throw new AppError('validation', 'Durée de report invalide');
  }
  return updateReminder(userId, reminderId, { remindAt: new Date(Date.now() + minutes * 60_000).toISOString() });
}

export async function cancelReminder(userId: string, reminderId: string): Promise<void> {
  const [row] = await db.update(reminders).set({ status: 'cancelled' })
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)))
    .returning();
  if (!row) throw notFound('Rappel');
  publish(row);
}

/**
 * Job planifié : envoie le rappel s'il est toujours prévu à cette heure.
 * Idempotent (un rappel modifié, annulé ou déjà envoyé est ignoré).
 */
export async function fireReminder(job: ReminderJobData): Promise<void> {
  const [row] = await db.update(reminders).set({ status: 'sent', sentAt: new Date() })
    .where(and(
      eq(reminders.id, job.reminderId),
      eq(reminders.status, 'scheduled'),
      eq(reminders.remindAt, new Date(job.remindAt)),
    ))
    .returning();
  if (!row) return;

  publish(row);
  await sendToUser(row.userId, {
    title: 'Rappel',
    body: row.text,
    url: '/planning',
    tag: `reminder-${row.id}`,
    reminder: { id: row.id },
  });
}

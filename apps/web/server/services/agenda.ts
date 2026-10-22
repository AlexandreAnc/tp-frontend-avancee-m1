import type { AgendaItem, AgendaResponse } from '@app/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CalendarEvent } from '../connectors/google/calendar-mcp';
import { createGoogleCalendarMcpServer } from '../connectors/google/calendar-mcp';
import { callMcpTool } from '../connectors/mcp';
import { getGoogleClient, hasConnector } from './connectors';
import { listReminders } from './reminders';

const { files } = schema;

async function googleEvents(userId: string, from: Date, to: Date): Promise<CalendarEvent[] | null> {
  if (!await hasConnector(userId, 'google')) return null;
  try {
    const result = await callMcpTool(createGoogleCalendarMcpServer(await getGoogleClient(userId)), 'list_events', {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
    }) as { events: CalendarEvent[] };
    return result.events;
  } catch (error) {
    // Agenda Google indisponible : le planning reste utilisable avec rappels et échéances.
    console.warn('[agenda] lecture Google impossible', error instanceof Error ? error.message : error);
    return [];
  }
}

/** Échéances repérées par l'analyse des documents (dates précises marquées comme échéance). */
export async function listDeadlines(userId: string, from: Date, to: Date): Promise<Extract<AgendaItem, { kind: 'deadline' }>[]> {
  const rows = await db.select({ id: files.id, name: files.name, analysis: files.analysis })
    .from(files).where(and(eq(files.userId, userId), isNull(files.deletedAt), eq(files.status, 'ready')));

  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  return rows.flatMap((file) => (file.analysis?.keyInfo.dates ?? [])
    .map((date, index) => ({ date, index }))
    .filter(({ date }) => date.isDeadline && date.iso && date.iso >= fromDay && date.iso <= toDay)
    .map(({ date, index }) => ({
      kind: 'deadline' as const,
      id: `${file.id}:${index}`,
      title: date.label,
      start: date.iso!,
      fileId: file.id,
      fileName: file.name,
      detail: date.value,
    })));
}

export async function getAgenda(userId: string, from: Date, to: Date): Promise<AgendaResponse> {
  const [events, reminders, deadlines] = await Promise.all([
    googleEvents(userId, from, to),
    listReminders(userId, { from, to }),
    listDeadlines(userId, from, to),
  ]);

  const items: AgendaItem[] = [
    ...(events ?? []).map((event) => ({ kind: 'event' as const, ...event })),
    ...reminders.map((reminder) => ({
      kind: 'reminder' as const,
      id: reminder.id,
      title: reminder.text,
      start: reminder.remindAt,
      status: reminder.status,
      fileId: reminder.fileId,
    })),
    ...deadlines,
  ].sort((a, b) => a.start.localeCompare(b.start));

  return { items, calendarConnected: events !== null };
}

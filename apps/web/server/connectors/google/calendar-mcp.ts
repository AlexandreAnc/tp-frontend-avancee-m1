import { calendarEventPayloadSchema } from '@app/shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import type { GoogleOAuthClient } from './oauth';

const listEventsInput = z.object({
  timeMin: z.iso.datetime({ offset: true }),
  timeMax: z.iso.datetime({ offset: true }),
});

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  link: string | null;
}

function structured<T extends object>(result: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result as Record<string, unknown> };
}

/** Serveur MCP Google Agenda, instancié pour un utilisateur avec ses tokens OAuth. */
export function createGoogleCalendarMcpServer(auth: GoogleOAuthClient): McpServer {
  const server = new McpServer({ name: 'google-calendar', version: '1.0.0' });
  const calendar = google.calendar({ version: 'v3', auth });

  server.registerTool('create_event', {
    description: "Crée un événement dans l'agenda principal de l'utilisateur",
    inputSchema: calendarEventPayloadSchema,
  }, async (event) => {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: { dateTime: event.start },
        end: { dateTime: event.end },
      },
    });
    return structured({ eventId: response.data.id ?? null, htmlLink: response.data.htmlLink ?? null });
  });

  server.registerTool('list_events', {
    description: "Liste les événements de l'agenda principal sur une période",
    inputSchema: listEventsInput,
  }, async ({ timeMin, timeMax }) => {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    const events: CalendarEvent[] = (response.data.items ?? []).map((item) => ({
      id: item.id ?? '',
      title: item.summary ?? '(sans titre)',
      start: item.start?.dateTime ?? item.start?.date ?? timeMin,
      end: item.end?.dateTime ?? item.end?.date ?? null,
      allDay: !item.start?.dateTime,
      location: item.location ?? null,
      link: item.htmlLink ?? null,
    }));
    return structured({ events });
  });

  return server;
}

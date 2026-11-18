import { calendarEventPayloadSchema } from '@app/shared';
import { formatDateTime, localToZonedIso } from './time';
import { defineAgentTool, parseActionPayload } from './types';

/** Ne crée rien : demande l'action au serveur, qui la soumet à la validation de l'utilisateur. */
export const createCalendarEventTool = defineAgentTool('create_calendar_event', (input, { api, timezone }) => {
  const payload = parseActionPayload(calendarEventPayloadSchema, {
    ...input,
    start: localToZonedIso(input.start, timezone),
    end: localToZonedIso(input.end, timezone),
  });
  return api.requestAction(
    { type: 'google_calendar.create_event', payload },
    `Ajouter « ${payload.title} » à Google Agenda le ${formatDateTime(payload.start, timezone)}`,
  );
});

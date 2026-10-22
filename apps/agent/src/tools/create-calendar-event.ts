import { calendarEventPayloadSchema } from '@app/shared';
import { TaskError } from '../tasks/errors';
import { localToZonedIso } from './time';
import { defineAgentTool } from './types';

/** Ne crée rien : demande l'action au serveur, qui la soumet à la validation de l'utilisateur. */
export const createCalendarEventTool = defineAgentTool('create_calendar_event', (input, { api, timezone }) => {
  const payload = calendarEventPayloadSchema.safeParse({
    ...input,
    start: localToZonedIso(input.start, timezone),
    end: localToZonedIso(input.end, timezone),
  });
  if (!payload.success) {
    throw new TaskError(payload.error.issues.map((issue) => issue.message).join(', '), false, false);
  }

  const when = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone })
    .format(new Date(payload.data.start));
  return api.requestAction(
    { type: 'google_calendar.create_event', payload: payload.data },
    `Ajouter « ${payload.data.title} » à Google Agenda le ${when}`,
  );
});

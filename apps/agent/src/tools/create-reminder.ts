import { reminderPayloadSchema } from '@app/shared';
import { formatDateTime, localToZonedIso } from './time';
import { defineAgentTool, parseActionPayload } from './types';

/** Rappel pour l'utilisateur : action sans risque, exécutée directement par le serveur. */
export const createReminderTool = defineAgentTool('create_reminder', (input, { api, timezone }) => {
  const payload = parseActionPayload(reminderPayloadSchema, {
    text: input.text,
    remindAt: localToZonedIso(input.at, timezone),
    fileId: input.fileId,
  });
  return api.requestAction({ type: 'reminder.create', payload }, `Rappel « ${payload.text} » le ${formatDateTime(payload.remindAt, timezone)}`);
});

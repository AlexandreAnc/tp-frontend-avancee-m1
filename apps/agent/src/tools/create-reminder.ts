import { reminderPayloadSchema } from '@app/shared';
import { TaskError } from '../tasks/errors';
import { localToZonedIso } from './time';
import { defineAgentTool } from './types';

/** Rappel pour l'utilisateur : action sans risque, exécutée directement par le serveur. */
export const createReminderTool = defineAgentTool('create_reminder', (input, { api, timezone }) => {
  const payload = reminderPayloadSchema.safeParse({
    text: input.text,
    remindAt: localToZonedIso(input.at, timezone),
    fileId: input.fileId,
  });
  if (!payload.success) {
    throw new TaskError(payload.error.issues.map((issue) => issue.message).join(', '), false, false);
  }
  const when = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone })
    .format(new Date(payload.data.remindAt));
  return api.requestAction({ type: 'reminder.create', payload: payload.data }, `Rappel « ${payload.data.text} » le ${when}`);
});

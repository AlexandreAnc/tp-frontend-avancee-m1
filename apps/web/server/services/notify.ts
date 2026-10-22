import { getSettings } from './settings';
import { isUserConnected } from './events';
import { sendToUser, type PushPayload } from './push';

type AwayNotification = 'documentReady' | 'replyReady';

const SETTING: Record<AwayNotification, 'notifyDocumentReady' | 'notifyReplyReady'> = {
  documentReady: 'notifyDocumentReady',
  replyReady: 'notifyReplyReady',
};

/** Notifie un événement seulement si l'app est fermée (sinon il s'affiche déjà en direct) et si l'utilisateur l'a activé. */
export async function notifyIfAway(userId: string, kind: AwayNotification, payload: PushPayload): Promise<void> {
  if (isUserConnected(userId)) return;
  try {
    const settings = await getSettings(userId);
    if (settings[SETTING[kind]]) await sendToUser(userId, payload);
  } catch (error) {
    // Notification de confort : son échec ne doit jamais faire échouer l'indexation ou la réponse.
    console.error('[notify] envoi impossible', error instanceof Error ? error.message : error);
  }
}

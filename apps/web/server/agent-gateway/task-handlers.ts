import type { AgentStep, TaskPayload, TaskResult, TaskType } from '@app/shared';
import { AppError } from '../utils/errors';
import { appendStep, clearSteps, conversationExists, saveAssistantReply, setMessageStatus } from '../services/conversations';
import { getFile, setFileStatus } from '../services/files';
import type { TaskSubject } from '../services/tasks';

/** Comportement du serveur à chaque étape du cycle de vie d'une tâche, selon son type. */
export interface TaskHandler<T extends TaskType> {
  /** Prépare l'attribution. `null` : l'objet de la tâche a été supprimé, la tâche est abandonnée. */
  prepare(userId: string, payload: TaskPayload<T>): Promise<{ conversationId: string | null } | null>;
  onStep(userId: string, payload: TaskPayload<T>, position: number, step: AgentStep): Promise<void>;
  onComplete(userId: string, payload: TaskPayload<T>, result: TaskResult<T>): Promise<void>;
  /** `final` : plus aucune nouvelle tentative ne sera faite. */
  onFail(userId: string, payload: TaskPayload<T>, error: string, final: boolean): Promise<void>;
  concerns(payload: TaskPayload<T>, subject: TaskSubject): boolean;
}

const ignoreNotFound = (error: unknown) => {
  if (error instanceof AppError && error.code === 'not_found') return null;
  throw error;
};

const fileIndexHandler: TaskHandler<'file.index'> = {
  async prepare(userId, payload) {
    const file = await getFile(userId, payload.fileId).catch(ignoreNotFound);
    if (!file) return null;
    await setFileStatus(userId, payload.fileId, 'processing');
    return { conversationId: null };
  },
  // L'indexation n'a pas de timeline : seules ses données (via l'API agent) comptent.
  async onStep() {},
  // Les chunks et l'analyse ont été enregistrés par `PUT /api/agent/files/:id/index-data`, qui passe le fichier en `ready`.
  async onComplete() {},
  async onFail(userId, payload, error, final) {
    await setFileStatus(userId, payload.fileId, final ? 'failed' : 'pending', final ? error : null).catch(ignoreNotFound);
  },
  concerns(payload, subject) {
    return 'all' in subject || ('fileId' in subject && subject.fileId === payload.fileId);
  },
};

const chatReplyHandler: TaskHandler<'chat.reply'> = {
  async prepare(userId, payload) {
    if (!await conversationExists(userId, payload.conversationId)) return null;
    // Une tâche reprise par une autre machine repart de zéro.
    await clearSteps(userId, payload.messageId);
    await setMessageStatus(userId, payload.messageId, 'processing');
    return { conversationId: payload.conversationId };
  },
  async onStep(userId, payload, position, step) {
    await appendStep(userId, { conversationId: payload.conversationId, messageId: payload.messageId, position, step });
  },
  async onComplete(userId, payload, result) {
    await saveAssistantReply(userId, {
      conversationId: payload.conversationId,
      messageId: payload.messageId,
      content: result.content,
    });
  },
  async onFail(userId, payload, _error, final) {
    await setMessageStatus(userId, payload.messageId, final ? 'failed' : 'queued');
  },
  concerns(payload, subject) {
    return 'all' in subject || ('conversationId' in subject && subject.conversationId === payload.conversationId);
  },
};

export const taskHandlers: { [T in TaskType]: TaskHandler<T> } = {
  'file.index': fileIndexHandler,
  'chat.reply': chatReplyHandler,
};

import {
  taskPayloadSchemas,
  type AgentStep,
  type AgentToServerMessage,
  type TaskAssignMessage,
  type TaskPayload,
  type TaskResult,
  type TaskType,
} from '@app/shared';
import { ApiClient } from '../api/client';
import type { AgentConfig } from '../config';
import { checkModels, LlmClient, type ModelCheck } from '../llm/ollama';
import { replyToChat } from './chat-reply';
import type { TaskContext } from './context';
import { createDraftSender } from './draft-sender';
import { errorMessage, TaskCancelledError, TaskError } from './errors';
import { indexFile } from './index-file';

const taskImplementations: { [T in TaskType]: (payload: TaskPayload<T>, context: TaskContext) => Promise<TaskResult<T>> } = {
  'file.index': indexFile,
  'chat.reply': replyToChat,
};

/** Exécute les tâches reçues du serveur. Sans état : tout est perdu (et repris ailleurs) à la déconnexion. */
export class TaskRunner {
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly config: AgentConfig,
    private capabilities: ModelCheck,
    private readonly send: (message: AgentToServerMessage) => void,
    /** Le serveur connecté accepte les brouillons de réponse (`welcome.drafts`). */
    private readonly serverAcceptsDrafts: () => boolean = () => false,
  ) {}

  /**
   * Bascule sur un autre modèle de chat (demandé depuis l'app), vérifié avant d'être appliqué :
   * les tâches suivantes l'utilisent, et il est annoncé au serveur à la prochaine connexion.
   * Le résultat (ou la raison du refus) est renvoyé au serveur dans `config.applied`.
   */
  async switchChatModel(chatModel: string): Promise<void> {
    try {
      this.capabilities = await checkModels({ ...this.config, CHAT_MODEL: chatModel });
      this.config.CHAT_MODEL = chatModel;
      console.info(`[agent] modèle de chat : ${chatModel}`);
      this.send({ type: 'config.applied', chatModel });
    } catch (error) {
      this.send({ type: 'config.applied', chatModel, error: errorMessage(error) });
    }
  }

  get size(): number {
    return this.running.size;
  }

  run(message: TaskAssignMessage): void {
    if (this.running.has(message.taskId)) return;
    const controller = new AbortController();
    this.running.set(message.taskId, controller);

    this.execute(message, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) this.send({ type: 'task.completed', taskId: message.taskId, result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const retryable = error instanceof TaskError ? error.retryable : true;
        const reason = errorMessage(error);
        console.error(`[agent] ${message.taskType} ${message.taskId} échouée : ${reason}`);
        this.send({ type: 'task.failed', taskId: message.taskId, error: reason, retryable });
      })
      .finally(() => {
        // La tâche a pu être annulée puis réattribuée à cette machine : ne pas oublier la nouvelle exécution.
        if (this.running.get(message.taskId) === controller) this.running.delete(message.taskId);
      });
  }

  private async execute(message: TaskAssignMessage, signal: AbortSignal): Promise<unknown> {
    const type = message.taskType;
    const payload = taskPayloadSchemas[type].safeParse(message.payload);
    if (!payload.success) throw new TaskError(`Payload ${type} invalide`, false);

    const drafts = createDraftSender((text) => this.send({ type: 'task.draft', taskId: message.taskId, text }));
    const context: TaskContext = {
      taskId: message.taskId,
      api: new ApiClient(this.config.SERVER_URL, message.token, signal),
      llm: new LlmClient(this.config, signal, this.capabilities.supportsThinking, this.capabilities.supportsVision),
      timezone: this.config.AGENT_TIMEZONE,
      signal,
      emitStep: async (step: AgentStep) => {
        if (signal.aborted) throw new TaskCancelledError();
        this.send({ type: 'task.step', taskId: message.taskId, step });
      },
      emitDraft: (text: string) => {
        if (!signal.aborted && this.serverAcceptsDrafts()) drafts.push(text);
      },
    };

    console.info(`[agent] ${type} ${message.taskId} démarrée`);
    const implementation = taskImplementations[type] as (payload: TaskPayload<TaskType>, context: TaskContext) => Promise<unknown>;
    try {
      const result = await implementation(payload.data, context);
      console.info(`[agent] ${type} ${message.taskId} terminée`);
      return result;
    } finally {
      // Aucun brouillon après la fin : la réponse définitive (ou l'échec) part juste après.
      drafts.stop();
    }
  }

  cancel(taskId: string): void {
    this.running.get(taskId)?.abort(new TaskCancelledError());
    this.running.delete(taskId);
  }

  /** Abandonne toutes les tâches (connexion perdue : le serveur les a déjà remises en file). */
  cancelAll(): void {
    for (const taskId of [...this.running.keys()]) this.cancel(taskId);
  }
}

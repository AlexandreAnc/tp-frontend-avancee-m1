import type { ChatReplyPayload, TaskResult } from '@app/shared';
import { createChatBackend } from '../llm/backends';
import { runOrchestrator } from '../loop/orchestrator';
import type { TaskContext } from './context';

const EMPTY_ANSWER = "Je n'ai pas réussi à formuler une réponse. Pouvez-vous reformuler votre question ?";

export async function replyToChat(payload: ChatReplyPayload, context: TaskContext): Promise<TaskResult<'chat.reply'>> {
  // IA choisie par l'utilisateur (sa clé), sinon le modèle du service. Les embeddings restent locaux.
  const backend = createChatBackend(await context.api.getChatLlmConfig());
  const llm = backend ? context.llm.withChatBackend(backend) : context.llm;
  const content = await runOrchestrator({
    history: payload.history,
    context: { api: context.api, llm, timezone: context.timezone },
    emitStep: context.emitStep,
    signal: context.signal,
  });
  return { content: content || EMPTY_ANSWER };
}

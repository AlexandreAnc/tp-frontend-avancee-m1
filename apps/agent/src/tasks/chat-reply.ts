import type { ChatReplyPayload, TaskResult } from '@app/shared';
import { runOrchestrator } from '../loop/orchestrator';
import type { TaskContext } from './context';

const EMPTY_ANSWER = "Je n'ai pas réussi à formuler une réponse. Pouvez-vous reformuler votre question ?";

export async function replyToChat(payload: ChatReplyPayload, context: TaskContext): Promise<TaskResult<'chat.reply'>> {
  const content = await runOrchestrator({
    history: payload.history,
    context: { api: context.api, llm: context.llm, timezone: context.timezone },
    emitStep: context.emitStep,
    signal: context.signal,
  });
  return { content: content || EMPTY_ANSWER };
}

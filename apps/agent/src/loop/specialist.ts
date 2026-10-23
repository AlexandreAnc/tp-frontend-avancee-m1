import { MAX_AGENT_ITERATIONS, SPECIALISTS, type AgentStep, type SpecialistName } from '@app/shared';
import { runTool, toOllamaTools } from '../tools';
import type { ToolContext } from '../tools/types';
import { isRecoverable, runLoop, serializeForModel } from './agent-loop';
import { buildSpecialistPrompt } from './prompts';

export interface SpecialistInput {
  specialist: SpecialistName;
  task: string;
  /** Délégation de l'orchestrateur : toutes les étapes du spécialiste y sont rattachées. */
  parentId: string;
  context: ToolContext;
  emitStep: (step: AgentStep) => Promise<void>;
  signal: AbortSignal;
  now: Date;
}

/** Un spécialiste exécute une consigne avec ses seuls outils et rend un compte rendu à l'orchestrateur. */
export async function runSpecialist({ specialist, task, parentId, context, emitStep, signal, now }: SpecialistInput): Promise<string> {
  const allowed = SPECIALISTS[specialist].tools;
  return runLoop({
    role: specialist,
    parentId,
    system: buildSpecialistPrompt(specialist, now, context.timezone),
    history: [{ role: 'user', content: task }],
    tools: toOllamaTools(allowed),
    maxIterations: MAX_AGENT_ITERATIONS,
    llm: context.llm,
    emitStep,
    signal,
    runCall: async ({ name, args, callId }, emit) => {
      await emit({ kind: 'tool_call', tool: name, input: args, callId });
      try {
        const result = await runTool(name, args, context, allowed);
        await emit(result.ok
          ? { kind: 'tool_result', tool: name, output: result.output, callId }
          : { kind: 'tool_result', tool: name, error: result.error, callId });
        return serializeForModel(result.ok ? result.output : { error: result.error });
      } catch (error) {
        if (!isRecoverable(error)) throw error;
        await emit({ kind: 'tool_result', tool: name, error: error.message, callId });
        return serializeForModel({ error: error.message });
      }
    },
  });
}

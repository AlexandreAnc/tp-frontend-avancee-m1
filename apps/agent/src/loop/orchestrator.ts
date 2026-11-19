import {
  delegationInputSchema,
  delegationToolName,
  MAX_ORCHESTRATOR_ITERATIONS,
  SPECIALIST_NAMES,
  SPECIALISTS,
  specialistForDelegationTool,
  type AgentStep,
} from '@app/shared';
import type { Tool } from 'ollama';
import { z } from 'zod';
import type { ToolContext } from '../tools/types';
import { isRecoverable, runLoop, serializeForModel } from './agent-loop';
import { buildOrchestratorPrompt } from './prompts';
import { runSpecialist } from './specialist';

export interface OrchestratorInput {
  history: { role: 'user' | 'assistant'; content: string }[];
  context: ToolContext;
  emitStep: (step: AgentStep) => Promise<void>;
  /** Réponse finale en cours d'écriture (affichage mot à mot). */
  emitDraft?: (text: string) => void;
  signal: AbortSignal;
  now?: Date;
}

/** Outils de l'orchestrateur : une délégation par spécialiste, rien d'autre. */
export function delegationTools(): Tool[] {
  const parameters = z.toJSONSchema(delegationInputSchema, { io: 'input' }) as NonNullable<Tool['function']['parameters']>;
  return SPECIALIST_NAMES.map((name) => ({
    type: 'function',
    function: {
      name: delegationToolName(name),
      description: `Confie une consigne au spécialiste ${SPECIALISTS[name].label} : ${SPECIALISTS[name].description}`,
      parameters,
    },
  }));
}

/**
 * Orchestrateur : découpe la demande, délègue aux spécialistes (en parallèle quand les sous-tâches
 * sont indépendantes), enchaîne si besoin, puis rédige la réponse finale à partir de leurs comptes rendus.
 */
export async function runOrchestrator({ history, context, emitStep, emitDraft, signal, now = new Date() }: OrchestratorInput): Promise<string> {
  return runLoop({
    role: 'orchestrator',
    system: buildOrchestratorPrompt(now, context.timezone),
    history,
    tools: delegationTools(),
    maxIterations: MAX_ORCHESTRATOR_ITERATIONS,
    llm: context.llm,
    emitStep,
    ...(emitDraft && { onDraft: emitDraft }),
    signal,
    runCall: async ({ name, args, callId }, emit) => {
      const rejectCall = async (error: string) => {
        await emit({ kind: 'tool_result', tool: name, error, callId });
        return serializeForModel({ error });
      };
      const specialist = specialistForDelegationTool(name);
      if (!specialist) return rejectCall(`Outil inconnu : ${name}`);
      const input = delegationInputSchema.safeParse(args);
      if (!input.success) return rejectCall(`Arguments invalides : ${z.prettifyError(input.error)}`);

      await emit({ kind: 'delegation', specialist, task: input.data.task, callId });
      try {
        const answer = await runSpecialist({ specialist, task: input.data.task, parentId: callId, context, emitStep, signal, now });
        await emit({ kind: 'delegation_result', specialist, answer, callId });
        return serializeForModel({ specialist, answer });
      } catch (error) {
        if (!isRecoverable(error)) throw error;
        await emit({ kind: 'delegation_result', specialist, error: error.message, callId });
        return serializeForModel({ specialist, error: error.message });
      }
    },
  });
}

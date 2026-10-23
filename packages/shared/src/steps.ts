import { z } from 'zod';
import { agentRoleSchema, SPECIALIST_NAMES } from './specialists';

/**
 * Champs communs : `agent` = auteur de l'étape (absent sur les anciennes étapes : agent unique),
 * `parentId` = délégation dans laquelle un spécialiste travaille.
 */
const origin = {
  agent: agentRoleSchema.optional(),
  parentId: z.string().max(64).optional(),
};

/** Une étape de la boucle agentique, affichée dans la timeline et stockée dans `agent_steps`. */
export const agentStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('thinking'), text: z.string(), ...origin }),
  z.object({ kind: z.literal('tool_call'), tool: z.string(), input: z.unknown(), callId: z.string().max(64).optional(), ...origin }),
  z.object({
    kind: z.literal('tool_result'),
    tool: z.string(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    callId: z.string().max(64).optional(),
    ...origin,
  }),
  // L'orchestrateur confie une consigne à un spécialiste ; ses étapes portent `parentId` = `callId`.
  z.object({ kind: z.literal('delegation'), specialist: z.enum(SPECIALIST_NAMES), task: z.string(), callId: z.string().max(64), ...origin }),
  z.object({
    kind: z.literal('delegation_result'),
    specialist: z.enum(SPECIALIST_NAMES),
    callId: z.string().max(64),
    answer: z.string().optional(),
    error: z.string().optional(),
    ...origin,
  }),
]);

export type AgentStep = z.infer<typeof agentStepSchema>;
export type AgentStepKind = AgentStep['kind'];

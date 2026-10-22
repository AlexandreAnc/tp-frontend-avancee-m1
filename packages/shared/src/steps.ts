import { z } from 'zod';

/** Une étape de la boucle agentique, affichée dans la timeline et stockée dans `agent_steps`. */
export const agentStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('thinking'), text: z.string() }),
  z.object({ kind: z.literal('tool_call'), tool: z.string(), input: z.unknown() }),
  z.object({
    kind: z.literal('tool_result'),
    tool: z.string(),
    output: z.unknown().optional(),
    error: z.string().optional(),
  }),
]);

export type AgentStep = z.infer<typeof agentStepSchema>;
export type AgentStepKind = AgentStep['kind'];

import { runRoutine } from '../../../../services/routines';
import { defineAppHandler } from '../../../../utils/handler';
import { agentActionRateLimit } from '../../../../utils/rate-limit';
import { requireTaskToken } from '../../../../utils/task-auth';
import { getUuidParam } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId, taskId, conversationId } = await requireTaskToken(event);
  agentActionRateLimit(taskId);
  const run = await runRoutine(userId, getUuidParam(event), 'agent', conversationId);
  return { status: run.status, steps: run.steps.map((step) => ({ label: step.label, status: step.status, error: step.error })) };
});

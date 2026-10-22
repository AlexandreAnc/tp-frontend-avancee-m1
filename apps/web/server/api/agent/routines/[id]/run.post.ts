import { runRoutine } from '../../../../services/routines';
import { defineAppHandler } from '../../../../utils/handler';
import { requireTaskToken } from '../../../../utils/task-auth';
import { getUuidParam } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId, conversationId } = await requireTaskToken(event);
  const run = await runRoutine(userId, getUuidParam(event), 'agent', conversationId);
  return { status: run.status, steps: run.steps.map((step) => ({ label: step.label, status: step.status, error: step.error })) };
});

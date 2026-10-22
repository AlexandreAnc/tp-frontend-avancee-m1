import { listRoutines } from '../../../services/routines';
import { defineAppHandler } from '../../../utils/handler';
import { requireTaskToken } from '../../../utils/task-auth';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const routines = await listRoutines(userId);
  return { routines: routines.map((routine) => ({ id: routine.id, name: routine.name, enabled: routine.enabled, steps: routine.steps.map((step) => step.label) })) };
});

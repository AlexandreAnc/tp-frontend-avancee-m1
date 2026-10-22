import { createStepUpOptions } from '../../services/step-up';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { options: await createStepUpOptions(user.id, user.sessionId) };
});

import { deleteAllConversations } from '../../services/conversations';
import { requireStepUpIfEnabled } from '../../services/step-up';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await requireStepUpIfEnabled(user.id, user.sessionId);
  return { deleted: await deleteAllConversations(user.id) };
});

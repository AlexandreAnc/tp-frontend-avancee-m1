import { listConversations } from '../../services/conversations';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { conversations: await listConversations(user.id) };
});

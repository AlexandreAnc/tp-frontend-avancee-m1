import { getAiSettings } from '../../services/ai-providers';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { ai: await getAiSettings(user.id) };
});

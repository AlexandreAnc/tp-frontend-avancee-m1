import { getHome } from '../../services/hue';
import { defineAppHandler } from '../../utils/handler';
import { requireTaskToken } from '../../utils/task-auth';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  return getHome(userId);
});

import { listTags } from '../../services/tags';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { tags: await listTags(user.id) };
});

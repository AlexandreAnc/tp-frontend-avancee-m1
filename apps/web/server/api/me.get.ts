import { getQuota } from '../services/files';
import { defineAppHandler } from '../utils/handler';
import { isAdmin, requireUser } from '../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { user, isAdmin: isAdmin(user), quota: await getQuota(user.id) };
});

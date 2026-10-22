import { getAction } from '../../services/actions';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { action: await getAction(user.id, getUuidParam(event)) };
});

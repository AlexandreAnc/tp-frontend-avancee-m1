import { undoActivity } from '../../../services/activity';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { activity: await undoActivity(user.id, getUuidParam(event)) };
});

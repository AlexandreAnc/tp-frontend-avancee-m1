import { retryMessage } from '../../../services/conversations';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await retryMessage(user.id, getUuidParam(event));
  return { ok: true };
});

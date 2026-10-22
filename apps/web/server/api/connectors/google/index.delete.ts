import { disconnectGoogle } from '../../../services/connectors';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await disconnectGoogle(user.id);
  return { ok: true };
});

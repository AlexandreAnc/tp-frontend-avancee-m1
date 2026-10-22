import { disconnectHue } from '../../../services/hue';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await disconnectHue(user.id);
  return { ok: true };
});

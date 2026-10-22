import { removeUnlockPin } from '../../../services/unlock-pin';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await removeUnlockPin(user.id);
  return { ok: true };
});

import { deleteAccount } from '../services/account';
import { requireStepUpIfEnabled } from '../services/step-up';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await requireStepUpIfEnabled(user.id, user.sessionId);
  await deleteAccount(user.id);
  return { ok: true };
});

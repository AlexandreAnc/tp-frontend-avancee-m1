import { pushSubscriptionSchema, subscribe } from '../../services/push';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await subscribe(user.id, await readValidatedBodyOrThrow(event, pushSubscriptionSchema));
  return { ok: true };
});

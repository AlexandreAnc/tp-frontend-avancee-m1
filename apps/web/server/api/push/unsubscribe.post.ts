import { z } from 'zod';
import { unsubscribe } from '../../services/push';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ endpoint: z.url() });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { endpoint } = await readValidatedBodyOrThrow(event, bodySchema);
  await unsubscribe(user.id, endpoint);
  return { ok: true };
});

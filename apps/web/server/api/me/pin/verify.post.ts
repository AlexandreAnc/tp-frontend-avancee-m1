import { z } from 'zod';
import { verifyUnlockPin } from '../../../services/unlock-pin';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({ pin: z.string().max(12) });

/** Déverrouillage de l'app par code de secours (n'autorise pas les actions sensibles : Face ID reste exigé). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await verifyUnlockPin(user.id, (await readValidatedBodyOrThrow(event, bodySchema)).pin);
  return { ok: true };
});

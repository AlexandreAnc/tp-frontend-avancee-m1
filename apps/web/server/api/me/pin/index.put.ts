import { z } from 'zod';
import { PIN_PATTERN, setUnlockPin } from '../../../services/unlock-pin';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({ pin: z.string().regex(PIN_PATTERN, 'Le code doit comporter 6 chiffres.') });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await setUnlockPin(user.id, (await readValidatedBodyOrThrow(event, bodySchema)).pin);
  return { ok: true };
});

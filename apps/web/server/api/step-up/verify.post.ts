import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import { verifyStepUp } from '../../services/step-up';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

// Structure vérifiée en détail par @simplewebauthn/server ; on contrôle ici sa forme générale.
const bodySchema = z.object({
  response: z.object({ id: z.string(), rawId: z.string(), type: z.literal('public-key'), response: z.record(z.string(), z.unknown()) }).loose(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { response } = await readValidatedBodyOrThrow(event, bodySchema);
  await verifyStepUp(user.id, user.sessionId, response as unknown as AuthenticationResponseJSON);
  return { ok: true };
});

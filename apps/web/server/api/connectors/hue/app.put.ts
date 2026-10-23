import { z } from 'zod';
import { getHueAppSettings, saveHueApp } from '../../../services/hue';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({
  clientId: z.string().trim().min(4).max(200),
  clientSecret: z.string().trim().min(4).max(400),
});

/** Application Philips Hue de l'utilisateur (developers.meethue.com), utilisée à la place de celle du serveur. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { clientId, clientSecret } = await readValidatedBodyOrThrow(event, bodySchema);
  await saveHueApp(user.id, clientId, clientSecret);
  return { app: await getHueAppSettings(user.id) };
});

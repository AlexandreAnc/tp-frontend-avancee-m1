import { getHueAppSettings } from '../../../services/hue';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { app: await getHueAppSettings(user.id) };
});

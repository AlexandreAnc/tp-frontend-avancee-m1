import { deleteHueApp, getHueAppSettings } from '../../../services/hue';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await deleteHueApp(user.id);
  return { app: await getHueAppSettings(user.id) };
});

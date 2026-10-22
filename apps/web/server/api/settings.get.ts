import { getSettings, toSettingsDto } from '../services/settings';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { settings: toSettingsDto(await getSettings(user.id)) };
});

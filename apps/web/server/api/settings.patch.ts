import { settingsUpdateSchema, updateSettings } from '../services/settings';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';
import { readValidatedBodyOrThrow } from '../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { settings: await updateSettings(user.id, await readValidatedBodyOrThrow(event, settingsUpdateSchema)) };
});

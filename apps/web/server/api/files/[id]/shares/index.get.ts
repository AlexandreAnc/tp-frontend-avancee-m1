import { listShareLinks } from '../../../../services/share';
import { defineAppHandler } from '../../../../utils/handler';
import { requireUser } from '../../../../utils/session';
import { getUuidParam } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { links: await listShareLinks(user.id, getUuidParam(event)) };
});

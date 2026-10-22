import { trashFiles } from '../../services/trash';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam } from '../../utils/validation';

/** Met le fichier à la corbeille (suppression définitive : `/api/trash`). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  await trashFiles(user.id, [getUuidParam(event)]);
  return { ok: true };
});

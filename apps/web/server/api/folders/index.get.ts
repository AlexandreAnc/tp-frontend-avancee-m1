import { listFolderTree } from '../../services/drive';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

/** Arborescence complète (choix de la destination d'un déplacement). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { folders: await listFolderTree(user.id) };
});

import { FILE_CATEGORIES } from '@app/shared';
import { z } from 'zod';
import { browse } from '../services/drive';
import { getQuota } from '../services/files';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';
import { getValidatedQueryOrThrow } from '../utils/validation';

const querySchema = z.object({
  folderId: z.uuid().optional(),
  q: z.string().max(200).optional(),
  category: z.enum(FILE_CATEGORIES).optional(),
});

/** Contenu d'un dossier (racine par défaut), ou résultats de recherche sur tout le drive. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { folderId, q, category } = getValidatedQueryOrThrow(event, querySchema);
  const [content, quota] = await Promise.all([browse(user.id, { folderId: folderId ?? null, query: q, category }), getQuota(user.id)]);
  return { ...content, quota };
});

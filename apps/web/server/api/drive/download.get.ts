import { sendStream, setResponseHeaders } from 'h3';
import { z } from 'zod';
import { zipFolder } from '../../services/zip';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getValidatedQueryOrThrow } from '../../utils/validation';

const querySchema = z.object({ folderId: z.uuid().optional() });

/** Archive .zip d'un dossier (ou de tout le drive), téléchargée en flux. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { folderId } = getValidatedQueryOrThrow(event, querySchema);
  const { name, stream } = await zipFolder(user.id, folderId ?? null);
  setResponseHeaders(event, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
  });
  return sendStream(event, stream);
});

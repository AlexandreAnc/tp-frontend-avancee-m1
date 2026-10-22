import { indexFileRequestSchema } from '@app/shared';
import { autoFileDocument } from '../../../../services/auto-file';
import { saveFileIndex } from '../../../../services/files';
import { defineAppHandler } from '../../../../utils/handler';
import { requireTaskToken } from '../../../../utils/task-auth';
import { getUuidParam, readValidatedBodyOrThrow } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const data = await readValidatedBodyOrThrow(event, indexFileRequestSchema);
  const fileId = getUuidParam(event);
  const result = await saveFileIndex(userId, fileId, data);
  // Le rangement est un bonus : son échec ne doit pas faire échouer (et relancer) l'indexation.
  await autoFileDocument(userId, fileId).catch((error: unknown) => console.error('[auto-file]', error));
  return result;
});

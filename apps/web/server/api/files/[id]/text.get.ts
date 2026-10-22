import { readFileQuerySchema } from '@app/shared';
import { readFileText } from '../../../services/files';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam, getValidatedQueryOrThrow } from '../../../utils/validation';

/** Texte extrait par l'agent (aperçu des Word, Excel et photos), par tranches. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return readFileText(user.id, getUuidParam(event), getValidatedQueryOrThrow(event, readFileQuerySchema));
});

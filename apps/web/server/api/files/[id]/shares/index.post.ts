import { SHARE_LINK_DURATIONS_HOURS } from '@app/shared';
import { z } from 'zod';
import { createShareLink } from '../../../../services/share';
import { defineAppHandler } from '../../../../utils/handler';
import { requireUser } from '../../../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../../../utils/validation';

const bodySchema = z.object({ hours: z.union(SHARE_LINK_DURATIONS_HOURS.map((hours) => z.literal(hours))) });

/** Le jeton n'est renvoyé qu'ici : le front construit l'URL `/s/<jeton>` à afficher. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { hours } = await readValidatedBodyOrThrow(event, bodySchema);
  return createShareLink(user.id, getUuidParam(event), hours);
});

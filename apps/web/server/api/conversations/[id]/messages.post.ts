import { z } from 'zod';
import { postMessage } from '../../../services/conversations';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({ content: z.string() });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { content } = await readValidatedBodyOrThrow(event, bodySchema);
  return { message: await postMessage(user.id, getUuidParam(event), content) };
});

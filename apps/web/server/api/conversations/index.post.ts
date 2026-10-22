import { z } from 'zod';
import { startConversation } from '../../services/conversations';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ content: z.string() });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { content } = await readValidatedBodyOrThrow(event, bodySchema);
  return startConversation(user.id, content);
});

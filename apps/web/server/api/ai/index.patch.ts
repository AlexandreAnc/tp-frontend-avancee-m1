import { aiProviderSchema } from '@app/shared';
import { z } from 'zod';
import { setAiChoice } from '../../services/ai-providers';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ provider: aiProviderSchema });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { provider } = await readValidatedBodyOrThrow(event, bodySchema);
  return { ai: await setAiChoice(user.id, provider) };
});

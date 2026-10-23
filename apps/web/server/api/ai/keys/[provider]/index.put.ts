import { aiApiKeySchema } from '@app/shared';
import { z } from 'zod';
import { saveAiKey } from '../../../../services/ai-providers';
import { defineAppHandler } from '../../../../utils/handler';
import { requireUser } from '../../../../utils/session';
import { getExternalAiProviderParam, readValidatedBodyOrThrow } from '../../../../utils/validation';

const bodySchema = z.object({ apiKey: aiApiKeySchema });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const provider = getExternalAiProviderParam(event);
  const { apiKey } = await readValidatedBodyOrThrow(event, bodySchema);
  return saveAiKey(user.id, provider, apiKey);
});

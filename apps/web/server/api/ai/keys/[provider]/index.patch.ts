import { aiModelSchema } from '@app/shared';
import { z } from 'zod';
import { setAiModel } from '../../../../services/ai-providers';
import { defineAppHandler } from '../../../../utils/handler';
import { requireUser } from '../../../../utils/session';
import { getExternalAiProviderParam, readValidatedBodyOrThrow } from '../../../../utils/validation';

const bodySchema = z.object({ model: aiModelSchema });

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { model } = await readValidatedBodyOrThrow(event, bodySchema);
  return { ai: await setAiModel(user.id, getExternalAiProviderParam(event), model) };
});

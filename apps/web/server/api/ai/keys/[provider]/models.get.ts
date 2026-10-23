import { listAiModels } from '../../../../services/ai-providers';
import { defineAppHandler } from '../../../../utils/handler';
import { requireUser } from '../../../../utils/session';
import { getExternalAiProviderParam } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { models: await listAiModels(user.id, getExternalAiProviderParam(event)) };
});

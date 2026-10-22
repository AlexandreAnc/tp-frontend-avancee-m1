import { getAgentModels } from '../agent-gateway/gateway';
import { defineAppHandler } from '../utils/handler';
import { isAdmin, requireUser } from '../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const info = getAgentModels();
  return { current: info?.current ?? null, models: info?.models ?? [], canChange: isAdmin(user) };
});

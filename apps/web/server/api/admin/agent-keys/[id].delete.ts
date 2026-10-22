import { revokeAgentKey } from '../../../services/agent-keys';
import { defineAppHandler } from '../../../utils/handler';
import { requireAdmin } from '../../../utils/session';
import { getUuidParam } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  await requireAdmin(event);
  return { agentKey: await revokeAgentKey(getUuidParam(event)) };
});

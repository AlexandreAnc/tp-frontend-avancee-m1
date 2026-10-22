import { listConnectedAgents } from '../../../agent-gateway/gateway';
import { listAgentKeys } from '../../../services/agent-keys';
import { defineAppHandler } from '../../../utils/handler';
import { getEnv } from '../../../utils/env';
import { requireAdmin } from '../../../utils/session';

export default defineAppHandler(async (event) => {
  await requireAdmin(event);
  return {
    keys: await listAgentKeys(),
    connected: listConnectedAgents(),
    embedModel: getEnv().EMBED_MODEL,
  };
});

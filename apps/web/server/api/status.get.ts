import { getAgentStatus } from '../agent-gateway/gateway';
import { countPendingMessages } from '../services/conversations';
import { listPendingFiles } from '../services/files';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';

/** État de l'agent et file d'attente de l'utilisateur (questions et analyses en attente). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const [messages, files] = await Promise.all([countPendingMessages(user.id), listPendingFiles(user.id)]);
  return {
    ...getAgentStatus(),
    queue: { messages, files: files.length, nextFileName: files[0]?.name ?? null },
  };
});

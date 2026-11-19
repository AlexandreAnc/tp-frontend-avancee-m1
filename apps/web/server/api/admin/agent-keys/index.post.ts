import { z } from 'zod';
import { createAgentKey } from '../../../services/agent-keys';
import { requireStepUpIfEnabled } from '../../../services/step-up';
import { defineAppHandler } from '../../../utils/handler';
import { requireAdmin } from '../../../utils/session';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({ name: z.string().min(1).max(100) });

/** Une clé d'agent reçoit les tâches de tous les comptes : une session volée ne doit pas suffire à en créer une. */
export default defineAppHandler(async (event) => {
  const admin = await requireAdmin(event);
  await requireStepUpIfEnabled(admin.id, admin.sessionId);
  const { name } = await readValidatedBodyOrThrow(event, bodySchema);
  return createAgentKey(name);
});

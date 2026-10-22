import { z } from 'zod';
import { setAgentChatModel } from '../../agent-gateway/gateway';
import { defineAppHandler } from '../../utils/handler';
import { requireAdmin } from '../../utils/session';
import { readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({ chatModel: z.string().min(1).max(200) });

/** Le modèle de chat vaut pour tous les comptes servis par la machine : réservé à l'admin. */
export default defineAppHandler(async (event) => {
  await requireAdmin(event);
  const { chatModel } = await readValidatedBodyOrThrow(event, bodySchema);
  await setAgentChatModel(chatModel);
  return { ok: true };
});

import { z } from 'zod';
import { createAgentKey } from '../../../services/agent-keys';
import { defineAppHandler } from '../../../utils/handler';
import { requireAdmin } from '../../../utils/session';
import { readValidatedBodyOrThrow } from '../../../utils/validation';

const bodySchema = z.object({ name: z.string().min(1).max(100) });

export default defineAppHandler(async (event) => {
  await requireAdmin(event);
  const { name } = await readValidatedBodyOrThrow(event, bodySchema);
  return createAgentKey(name);
});

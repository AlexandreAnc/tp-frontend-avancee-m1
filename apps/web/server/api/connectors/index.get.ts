import { listConnectors } from '../../services/connectors';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { connectors: await listConnectors(user.id) };
});

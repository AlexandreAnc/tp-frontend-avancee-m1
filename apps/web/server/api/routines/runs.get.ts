import { listRuns } from '../../services/routines';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { runs: await listRuns(user.id) };
});

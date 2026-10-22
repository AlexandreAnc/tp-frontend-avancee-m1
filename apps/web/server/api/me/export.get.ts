import { setResponseHeader } from 'h3';
import { exportAccount } from '../../services/account';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  setResponseHeader(event, 'content-disposition', `attachment; filename="dashia-export-${new Date().toISOString().slice(0, 10)}.json"`);
  setResponseHeader(event, 'cache-control', 'no-store');
  return exportAccount(user.id);
});

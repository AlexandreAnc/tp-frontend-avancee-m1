import { agendaQuerySchema } from '@app/shared';
import { getAgenda } from '../services/agenda';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';
import { getValidatedQueryOrThrow } from '../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { from, to } = getValidatedQueryOrThrow(event, agendaQuerySchema);
  return getAgenda(user.id, new Date(from), new Date(to));
});

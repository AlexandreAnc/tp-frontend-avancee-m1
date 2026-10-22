import { agendaQuerySchema } from '@app/shared';
import { getAgenda } from '../../services/agenda';
import { defineAppHandler } from '../../utils/handler';
import { requireTaskToken } from '../../utils/task-auth';
import { getValidatedQueryOrThrow } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const { from, to } = getValidatedQueryOrThrow(event, agendaQuerySchema);
  return getAgenda(userId, new Date(from), new Date(to));
});

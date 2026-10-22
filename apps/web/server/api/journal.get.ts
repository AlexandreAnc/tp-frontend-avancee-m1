import { z } from 'zod';
import { listJournal } from '../services/journal';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';
import { getValidatedQueryOrThrow } from '../utils/validation';

const querySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { before, limit } = getValidatedQueryOrThrow(event, querySchema);
  return listJournal(user.id, { before: before ? new Date(before) : undefined, limit });
});

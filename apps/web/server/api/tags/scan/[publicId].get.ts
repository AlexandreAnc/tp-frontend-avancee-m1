import { getRouterParam } from 'h3';
import { z } from 'zod';
import { previewTag } from '../../../services/tags';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { parseOrThrow } from '../../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return previewTag(user.id, parseOrThrow(z.string().min(10).max(64), getRouterParam(event, 'publicId')));
});

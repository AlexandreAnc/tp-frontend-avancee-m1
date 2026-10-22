import { getRouterParam } from 'h3';
import { z } from 'zod';
import { scanTag } from '../../../services/tags';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { parseOrThrow } from '../../../utils/validation';

/** Tap sur un tag : la session de l'utilisateur est exigée, le tag seul n'authentifie jamais. */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return scanTag(user.id, parseOrThrow(z.string().min(10).max(64), getRouterParam(event, 'publicId')));
});

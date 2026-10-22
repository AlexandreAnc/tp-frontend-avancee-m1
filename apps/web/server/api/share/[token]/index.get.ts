import { getRequestIP, getRouterParam } from 'h3';
import { describeShareLink } from '../../../services/share';
import { defineAppHandler } from '../../../utils/handler';
import { shareRateLimit } from '../../../utils/rate-limit';

/** Public (sans session) : le jeton du lien suffit. */
export default defineAppHandler(async (event) => {
  shareRateLimit(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown');
  return { file: await describeShareLink(getRouterParam(event, 'token') ?? '') };
});

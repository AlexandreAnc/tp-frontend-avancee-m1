import { getRequestIP, getRouterParam, sendStream, setResponseHeaders } from 'h3';
import { openSharedFile } from '../../../services/share';
import { defineAppHandler } from '../../../utils/handler';
import { shareRateLimit } from '../../../utils/rate-limit';

/**
 * Public (sans session). Toujours en pièce jointe, jamais affiché dans la page :
 * un fichier partagé ne peut pas s'exécuter sur l'origine de l'application.
 */
export default defineAppHandler(async (event) => {
  shareRateLimit(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown');
  const { file, stream } = await openSharedFile(getRouterParam(event, 'token') ?? '');
  setResponseHeaders(event, {
    'content-type': 'application/octet-stream',
    'content-length': file.sizeBytes,
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
  });
  return sendStream(event, stream);
});

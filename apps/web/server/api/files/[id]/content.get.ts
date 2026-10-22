import { getQuery, sendStream, setResponseHeaders } from 'h3';
import { openFileForAgent } from '../../../services/files';
import { defineAppHandler } from '../../../utils/handler';
import { requireUser } from '../../../utils/session';
import { getUuidParam } from '../../../utils/validation';

/**
 * Fichier original pour l'aperçu (`inline`) ou le téléchargement (`?download=1`).
 * Le type est celui détecté à l'upload ; `nosniff` interdit au navigateur d'en deviner un autre.
 * Les fichiers texte reçoivent en plus une CSP `sandbox` (aucun script exécutable). Pas pour
 * les PDF : Chrome refuse d'afficher un PDF dans un document sandboxé.
 */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const { file, stream } = await openFileForAgent(user.id, getUuidParam(event));
  const disposition = getQuery(event).download ? 'attachment' : 'inline';
  setResponseHeaders(event, {
    'content-type': file.mimeType.startsWith('text/') ? `${file.mimeType}; charset=utf-8` : file.mimeType,
    'content-length': file.sizeBytes,
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
    ...(file.mimeType.startsWith('text/') ? { 'content-security-policy': "sandbox; default-src 'none'" } : {}),
  });
  return sendStream(event, stream);
});

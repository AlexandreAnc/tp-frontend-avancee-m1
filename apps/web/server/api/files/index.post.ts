import { getRequestHeader } from 'h3';
import { uploadFile } from '../../services/files';
import { AppError } from '../../utils/errors';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';

/**
 * Upload d'un fichier en corps brut (pas de multipart) : le nom est dans `X-File-Name` (encodé URI),
 * le dossier de destination éventuel dans `X-Folder-Id`.
 * Le corps est lu en flux, la taille est contrôlée pendant la réception.
 */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);

  const declaredLength = Number(getRequestHeader(event, 'content-length'));
  const rawName = getRequestHeader(event, 'x-file-name');
  if (!rawName) throw new AppError('validation', 'En-tête X-File-Name manquant');

  let fileName: string;
  try {
    fileName = decodeURIComponent(rawName);
  } catch {
    throw new AppError('validation', 'Nom de fichier invalide');
  }

  const folderId = getRequestHeader(event, 'x-folder-id');
  if (folderId && !/^[0-9a-f-]{36}$/i.test(folderId)) throw new AppError('validation', 'Dossier invalide');

  const file = await uploadFile(user.id, {
    fileName,
    folderId: folderId || null,
    stream: event.node.req,
    declaredBytes: Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : undefined,
  });
  return { file };
});

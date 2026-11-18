/**
 * Fichiers reçus par le partage du téléphone (Web Share Target) ou ouverts avec l'app sur ordinateur (`file_handlers`).
 * Gardés dans le Cache Storage du navigateur, lisible par le service worker comme par la page,
 * jusqu'à ce que le drive les envoie par le dépôt habituel (toutes les limites restent vérifiées par le serveur).
 */

/** Adresse du formulaire de partage déclarée dans le manifeste (`share_target.action`), interceptée par le service worker. */
export const SHARE_TARGET_PATH = '/partage';
/** Champ multipart des fichiers partagés (`share_target.params.files[].name`). */
export const SHARE_TARGET_FIELD = 'files';
/** Page où le drive reprend les fichiers en attente. */
export const SHARED_FILES_PAGE = '/drive?partage=1';
/** Fichiers de l'utilisateur : vidé à la déconnexion avec les autres caches de données. */
export const SHARED_FILES_CACHE = 'shared-files';

const KEY_PREFIX = '/__shared-files/';

/** Le sous-ensemble de l'API `Cache` utilisé ici (remplaçable par un faux dans les tests). */
export interface FileCache {
  put(request: string, response: Response): Promise<void>;
  keys(): Promise<readonly { url: string }[]>;
  match(request: string): Promise<Response | undefined>;
  delete(request: string): Promise<boolean>;
}

/** Garde les fichiers dans le cache, dans l'ordre reçu. Renvoie le nombre de fichiers gardés. */
export async function storeSharedFiles(cache: FileCache, files: readonly File[], now = Date.now()): Promise<number> {
  for (const [index, file] of files.entries()) {
    // Clé triable : date puis position, pour rendre les fichiers dans l'ordre du partage.
    const key = `${KEY_PREFIX}${now}-${String(index).padStart(4, '0')}`;
    await cache.put(key, new Response(file, {
      headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) },
    }));
  }
  return files.length;
}

/** Reprend (et retire du cache) les fichiers en attente, les plus anciens d'abord. */
export async function takeSharedFiles(cache: FileCache): Promise<File[]> {
  const keys = (await cache.keys()).map((request) => new URL(request.url, 'http://localhost').pathname)
    .filter((path) => path.startsWith(KEY_PREFIX))
    .sort();
  const files: File[] = [];
  for (const key of keys) {
    const response = await cache.match(key);
    await cache.delete(key);
    if (!response) continue;
    const name = decodeURIComponent(response.headers.get('x-file-name') ?? '') || 'document';
    files.push(new File([await response.blob()], name, { type: response.headers.get('content-type') ?? '' }));
  }
  return files;
}

/** Fichiers d'un formulaire de partage (les champs texte, titre et lien, sont ignorés : le drive ne reçoit que des fichiers). */
export function filesFromShare(form: FormData): File[] {
  return form.getAll(SHARE_TARGET_FIELD).filter((value): value is File => typeof value !== 'string' && value.size > 0);
}

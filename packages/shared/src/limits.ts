export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo par fichier
export const MAX_STORAGE_BYTES_PER_USER = 500 * 1024 * 1024; // 500 Mo de stockage par compte (corbeille comprise)
/** Durée de conservation dans la corbeille avant suppression définitive. */
export const TRASH_RETENTION_DAYS = 30;
/** Durées proposées pour un lien de partage, en heures. */
export const SHARE_LINK_DURATIONS_HOURS = [1, 24, 24 * 7] as const;
export type ShareLinkDuration = (typeof SHARE_LINK_DURATIONS_HOURS)[number];
/** Taille maximale d'un téléchargement de dossier en .zip. */
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/heic',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** Extensions acceptées par le sélecteur de fichiers (confort uniquement, le serveur vérifie le contenu). */
export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx', '.xlsx', '.jpg', '.jpeg', '.png', '.heic'] as const;

/** Formats lus par le modèle vision de l'agent (photos, scans). */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;

export function isImageMimeType(value: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/** Taille lisible (« 50 Mo », « 1,5 Go »), partagée par les messages serveur et l'interface. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / 1024 / 1024;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1).replace('.', ',')} Mo`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} Go`;
}

/** Durée de vie d'une action en attente de validation. Expirée = annulée. */
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

/** Nombre maximal d'itérations de la boucle d'un spécialiste (appels au modèle). */
export const MAX_AGENT_ITERATIONS = 8;

/** Nombre maximal de tours de délégation de l'orchestrateur avant sa réponse finale. */
export const MAX_ORCHESTRATOR_ITERATIONS = 4;

/** Longueur maximale d'un message utilisateur dans le chat. */
export const MAX_CHAT_MESSAGE_LENGTH = 4000;

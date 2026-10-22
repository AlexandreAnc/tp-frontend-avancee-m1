interface ApiErrorBody {
  message?: string;
  data?: { code?: string };
}

/** Message lisible par l'utilisateur à partir d'une erreur `$fetch` (les services renvoient des messages en français). */
export function getErrorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Vous êtes hors ligne. Réessayez une fois la connexion rétablie.';
  }
  if (error && typeof error === 'object' && 'data' in error) {
    const body = (error as { data?: ApiErrorBody }).data;
    if (body?.message) return body.message;
  }
  return fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error as { data?: ApiErrorBody }).data?.data?.code;
  }
  return undefined;
}

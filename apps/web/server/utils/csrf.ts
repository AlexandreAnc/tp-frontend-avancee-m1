/**
 * Protection CSRF : une requête qui modifie des données doit venir du site lui-même.
 * Le cookie de session est déjà `SameSite=Lax` ; ce contrôle d'origine ferme les cas restants
 * (sous-domaine compromis, navigateur ancien, formulaire auto-soumis vers l'API).
 */
export interface RequestOrigin {
  origin?: string | null;
  /** `Sec-Fetch-Site`, envoyé par les navigateurs récents : `same-origin`, `same-site`, `cross-site` ou `none`. */
  fetchSite?: string | null;
}

/** Origines acceptées : celle de l'app, et en développement les tunnels `cloudflared` (comme Better Auth). */
export function allowedOrigin(origin: string, appUrl: string, production: boolean): boolean {
  if (origin === new URL(appUrl).origin) return true;
  return !production && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin);
}

export function isCrossSiteRequest(request: RequestOrigin, appUrl: string, production: boolean): boolean {
  // Un navigateur envoie toujours `Origin` sur une requête POST, PUT, PATCH ou DELETE (`null` depuis un contexte opaque : refusé).
  if (request.origin) return !allowedOrigin(request.origin, appUrl, production);
  // Sans `Origin` (client non navigateur, donc sans cookie de session) : on ne refuse que ce qui se déclare inter-sites.
  return request.fetchSite === 'cross-site';
}

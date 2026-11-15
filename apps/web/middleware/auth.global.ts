const PUBLIC_ROUTES = new Set(['/login']);

/** Récupère la session, ou `undefined` si le serveur est injoignable (hors ligne, serveur arrêté). */
async function fetchSession() {
  try {
    // Import paresseux : le client d'authentification (et WebAuthn) reste hors du bundle des pages publiques.
    const { authClient } = await import('~/composables/useAuth');
    const { data, error } = await authClient.getSession();
    if (isSessionUnverifiable(error)) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/** Pages ouvertes sans compte : le lien de partage porte son propre jeton. */
const PUBLIC_PREFIXES = ['/s/'];

export default defineNuxtRouteMiddleware(async (to) => {
  // Site public (landing, blog) : pré-rendu, aucune requête de session.
  if (to.meta.marketing || PUBLIC_PREFIXES.some((prefix) => to.path.startsWith(prefix))) return;
  const session = await fetchSession();
  const unreachable = useServerUnreachable();
  unreachable.value = session === undefined;
  // Session invérifiable : on laisse consulter l'historique en cache (l'API exige toujours une session).
  if (session === undefined) return;

  const loggedIn = Boolean(session?.session);
  if (!loggedIn && !PUBLIC_ROUTES.has(to.path)) {
    return navigateTo({ path: '/login', query: to.fullPath !== '/panel' ? { redirect: to.fullPath } : {} });
  }
  if (loggedIn && PUBLIC_ROUTES.has(to.path)) {
    return navigateTo('/panel');
  }
});

const PUBLIC_ROUTES = new Set(['/login']);

/** Récupère la session, ou `undefined` si le serveur est injoignable (hors ligne, serveur arrêté). */
async function fetchSession() {
  try {
    const { data, error } = await authClient.getSession();
    // Requête non aboutie (pas de statut), limite de débit ou panne serveur : session inconnue, pas « déconnecté ».
    if (error && (!error.status || error.status === 429 || error.status >= 500)) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/** Pages ouvertes sans compte : le lien de partage porte son propre jeton. */
const PUBLIC_PREFIXES = ['/s/'];

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_PREFIXES.some((prefix) => to.path.startsWith(prefix))) return;
  const session = await fetchSession();
  const unreachable = useServerUnreachable();
  unreachable.value = session === undefined;
  // Session invérifiable : on laisse consulter l'historique en cache (l'API exige toujours une session).
  if (session === undefined) return;

  const loggedIn = Boolean(session?.session);
  if (!loggedIn && !PUBLIC_ROUTES.has(to.path)) {
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} });
  }
  if (loggedIn && PUBLIC_ROUTES.has(to.path)) {
    return navigateTo('/');
  }
});

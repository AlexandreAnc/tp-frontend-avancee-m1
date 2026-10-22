const PUBLIC_ROUTES = new Set(['/login']);

/** Récupère la session, ou `undefined` si le serveur est injoignable (hors ligne, serveur arrêté). */
async function fetchSession() {
  try {
    const { data, error } = await authClient.getSession();
    // Better Auth renvoie une erreur sans statut HTTP quand la requête n'a pas abouti.
    if (error && !error.status) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
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

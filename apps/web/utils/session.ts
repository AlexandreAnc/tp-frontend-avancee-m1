/**
 * Une vérification de session qui n'aboutit pas ne veut pas dire « déconnecté » :
 * requête sans réponse (hors ligne), limite de débit (429) ou panne serveur (5xx) laissent la session inconnue.
 * Les traiter comme une déconnexion renvoyait tout le monde sur /login dès que la limite était atteinte.
 */
export function isSessionUnverifiable(error: { status?: number } | null | undefined): boolean {
  if (!error) return false;
  return !error.status || error.status === 429 || error.status >= 500;
}

/** Page où revenir après connexion : uniquement un chemin interne (`//site.com` ou `/\site.com` mènerait ailleurs). */
export function safeRedirect(target: unknown): string {
  return typeof target === 'string' && /^\/(?![/\\])/.test(target) ? target : '/panel';
}

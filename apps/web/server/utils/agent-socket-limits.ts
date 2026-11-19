/**
 * Limites du WebSocket des agents, appliquées avant `JSON.parse` : le point d'entrée est public, et une connexion
 * pas encore authentifiée ne doit pas pouvoir faire analyser au serveur des messages arbitrairement gros.
 */

/** `hello` : un nom, des modèles et la clé. 64 Ko laissent une large marge pour la liste des modèles. */
export const MAX_HELLO_MESSAGE_CHARS = 64 * 1024;
/** Agent authentifié : étapes (résultats d'outils tronqués à 12 000 caractères) et réponses de chat. */
export const MAX_AGENT_MESSAGE_CHARS = 1024 * 1024;
/** Connexions ouvertes simultanément sans avoir encore envoyé `hello`. */
export const MAX_CONNECTIONS_AWAITING_HELLO = 50;

export function isAgentMessageTooLarge(raw: string, authenticated: boolean): boolean {
  return raw.length > (authenticated ? MAX_AGENT_MESSAGE_CHARS : MAX_HELLO_MESSAGE_CHARS);
}

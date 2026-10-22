/** Vrai quand le serveur n'a pas pu être joint (appareil hors ligne ou serveur arrêté). */
export function useServerUnreachable() {
  return useState('server-unreachable', () => false);
}

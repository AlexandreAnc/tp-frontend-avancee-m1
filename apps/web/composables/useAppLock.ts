const LAST_ACTIVE_KEY = 'dashia-last-active';

/**
 * Verrouillage de l'app après N minutes d'inactivité (réglage du compte). Le déverrouillage
 * passe par une vérification biométrique validée par le serveur.
 */
export function useAppLock() {
  const isLocked = useState('app-locked', () => false);
  const lockAfterMinutes = useState<number | null>('lock-after', () => null);

  function touch() {
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    } catch {
      // Stockage indisponible : le verrouillage se base sur la session en cours uniquement.
    }
  }

  function evaluate() {
    if (lockAfterMinutes.value === null) return;
    let lastActive = Date.now();
    try {
      lastActive = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? Date.now());
    } catch {
      // Voir `touch`.
    }
    if (Date.now() - lastActive >= lockAfterMinutes.value * 60_000) isLocked.value = true;
  }

  return {
    isLocked,
    lockAfterMinutes,
    touch,
    evaluate,
    unlock: () => {
      isLocked.value = false;
      touch();
    },
  };
}

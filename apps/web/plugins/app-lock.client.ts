import { isMarketingPath } from '#shared/site';

export default defineNuxtPlugin(() => {
  const lock = useAppLock();

  async function loadSetting() {
    try {
      // Import paresseux : WebAuthn n'est téléchargé que sur les pages de l'app.
      const [{ settings }, { browserSupportsWebAuthn }] = await Promise.all([$fetch('/api/settings'), import('@simplewebauthn/browser')]);
      const supported = browserSupportsWebAuthn();
      // Sans WebAuthn ni code de secours, impossible de déverrouiller : pas de verrouillage.
      lock.hasPin.value = settings.hasUnlockPin;
      lock.lockAfterMinutes.value = supported || settings.hasUnlockPin ? settings.lockAfterMinutes : null;
      lock.evaluate();
    } catch {
      // Non connecté ou hors ligne : pas de verrouillage.
    }
  }

  // Rien à verrouiller sur le site public : le réglage est chargé à la première page de l'app.
  const router = useRouter();
  let loaded = false;
  function loadOnAppPage(path: string) {
    if (loaded || isMarketingPath(path)) return;
    loaded = true;
    void loadSetting();
  }
  loadOnAppPage(window.location.pathname);
  router.afterEach((to) => loadOnAppPage(to.path));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lock.touch();
    else lock.evaluate();
  });
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, () => {
      if (!lock.isLocked.value) lock.touch();
    }, { passive: true });
  }

  return { provide: { reloadAppLock: loadSetting } };
});

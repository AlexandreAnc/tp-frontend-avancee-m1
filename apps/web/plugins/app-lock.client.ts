export default defineNuxtPlugin(() => {
  const lock = useAppLock();
  const { supported } = useStepUp();

  async function loadSetting() {
    try {
      const { settings } = await $fetch('/api/settings');
      // Sans WebAuthn, impossible de déverrouiller par biométrie : pas de verrouillage.
      lock.lockAfterMinutes.value = supported ? settings.lockAfterMinutes : null;
      lock.evaluate();
    } catch {
      // Non connecté ou hors ligne : pas de verrouillage.
    }
  }

  void loadSetting();
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

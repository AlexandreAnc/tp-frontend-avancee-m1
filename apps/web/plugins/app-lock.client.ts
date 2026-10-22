export default defineNuxtPlugin(() => {
  const lock = useAppLock();
  const { supported } = useStepUp();

  async function loadSetting() {
    try {
      const { settings } = await $fetch('/api/settings');
      // Sans WebAuthn ni code de secours, impossible de déverrouiller : pas de verrouillage.
      lock.hasPin.value = settings.hasUnlockPin;
      lock.lockAfterMinutes.value = supported || settings.hasUnlockPin ? settings.lockAfterMinutes : null;
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

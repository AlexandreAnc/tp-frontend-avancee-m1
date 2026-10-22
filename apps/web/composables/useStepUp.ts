import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';

/** Vérification Face ID / empreinte auprès du serveur (validation forte des actions sensibles). */
export function useStepUp() {
  const supported = import.meta.client && browserSupportsWebAuthn();

  async function verify(): Promise<void> {
    const { options } = await $fetch('/api/step-up/options', { method: 'POST' });
    const response = await startAuthentication({ optionsJSON: options });
    await $fetch('/api/step-up/verify', { method: 'POST', body: { response } });
  }

  /**
   * Exécute `task` ; si le serveur exige une vérification biométrique, la demande puis réessaie.
   * L'utilisateur peut annuler la fenêtre système : l'erreur remonte alors normalement.
   */
  async function withStepUp<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (getErrorCode(error) !== 'step_up_required' || !supported) throw error;
      await verify();
      return task();
    }
  }

  return { supported, verify, withStepUp };
}

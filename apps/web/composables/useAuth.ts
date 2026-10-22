import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/vue';

export const authClient = createAuthClient({ plugins: [passkeyClient()] });

export function useAuth() {
  async function signOut() {
    await authClient.signOut();
    // Les réponses API en cache appartiennent à l'utilisateur qui se déconnecte.
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-user-cache' });
    clearNuxtState();
    await navigateTo('/login');
  }

  return { session: authClient.useSession(), signOut };
}

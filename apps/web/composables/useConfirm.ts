export interface ConfirmOptions {
  title: string;
  message?: string;
  confirm?: string;
  /** Action destructrice : bouton rouge. */
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Boîte de confirmation de l'app (remplace `window.confirm`), affichée par `ConfirmDialog` dans `app.vue`.
 * `await ask({ ... })` renvoie `true` si l'utilisateur confirme.
 */
export function useConfirm() {
  const request = useState<ConfirmRequest | null>('confirm-request', () => null);

  function ask(options: ConfirmOptions): Promise<boolean> {
    request.value?.resolve(false);
    return new Promise((resolve) => {
      request.value = { ...options, resolve };
    });
  }

  function answer(confirmed: boolean) {
    request.value?.resolve(confirmed);
    request.value = null;
  }

  return { request: readonly(request), ask, answer };
}

/** Nombre d'actions à valider : pastille de la navigation et de l'icône de l'app installée. */
export function usePendingActions() {
  const count = useState('pending-actions', () => 0);

  async function refresh() {
    try {
      const { actions } = await $fetch('/api/actions', { query: { status: 'pending' } });
      count.value = actions.length;
      updateAppBadge(count.value);
    } catch {
      // Hors ligne : on garde la dernière valeur connue.
    }
  }

  return { count, refresh };
}

function updateAppBadge(count: number) {
  if (!('setAppBadge' in navigator)) return;
  (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}

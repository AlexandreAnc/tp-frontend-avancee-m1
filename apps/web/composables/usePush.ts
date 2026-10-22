function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** Abonnement de l'appareil aux notifications push (demandes de confirmation). */
export function usePush() {
  const supported = ref(false);
  const subscribed = ref(false);
  const permission = ref<NotificationPermission>('default');

  async function registration() {
    return navigator.serviceWorker.ready;
  }

  onMounted(async () => {
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported.value) return;
    permission.value = Notification.permission;
    subscribed.value = Boolean(await (await registration()).pushManager.getSubscription());
  });

  async function subscribe() {
    permission.value = await Notification.requestPermission();
    if (permission.value !== 'granted') {
      throw new Error('Notifications refusées. Autorisez-les dans les réglages du navigateur.');
    }
    const { publicKey } = await $fetch<{ publicKey: string }>('/api/push/public-key');
    const subscription = await (await registration()).pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await $fetch('/api/push/subscribe', { method: 'POST', body: subscription.toJSON() });
    subscribed.value = true;
  }

  async function unsubscribe() {
    const subscription = await (await registration()).pushManager.getSubscription();
    if (subscription) {
      await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
    }
    subscribed.value = false;
  }

  return { supported, subscribed, permission, subscribe, unsubscribe };
}

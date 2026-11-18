import type { OutboxEntry } from '~/utils/outbox';

/**
 * File d'envoi hors ligne du chat : un message écrit sans réseau est gardé sur l'appareil
 * et envoyé automatiquement au retour de la connexion (événement `online`, ou au prochain lancement de l'app).
 * Pas de Background Sync : iOS ne l'a pas, et l'envoi depuis la page garde la session et les erreurs visibles.
 */
export function useOutbox() {
  const { me } = useMe();
  const entries = useState<OutboxEntry[]>('outbox', () => []);
  const flushing = useState('outbox-flushing', () => false);
  const key = computed(() => (me.value ? outboxKey(me.value.user.id) : null));

  function load() {
    entries.value = key.value ? readOutbox(localStorage, key.value) : [];
  }

  function save(next: OutboxEntry[]) {
    entries.value = next;
    if (key.value) writeOutbox(localStorage, key.value, next);
  }

  function enqueue(conversationId: string | null, content: string) {
    save([...entries.value, { id: crypto.randomUUID(), conversationId, content, createdAt: new Date().toISOString() }]);
  }

  function remove(id: string) {
    save(entries.value.filter((entry) => entry.id !== id));
  }

  async function send(entry: OutboxEntry) {
    if (entry.conversationId) {
      await $fetch(`/api/conversations/${entry.conversationId}/messages`, { method: 'POST', body: { content: entry.content } });
    } else {
      await $fetch('/api/conversations', { method: 'POST', body: { content: entry.content } });
    }
  }

  async function flush() {
    if (flushing.value || !navigator.onLine || !entries.value.some((entry) => !entry.error)) return;
    flushing.value = true;
    try {
      const outcomes = await flushOutbox(entries.value, send, (error) => getErrorMessage(error));
      save(settleOutbox(entries.value, outcomes));
      if ([...outcomes.values()].includes('sent')) await refreshNuxtData('conversations');
    } finally {
      flushing.value = false;
    }
  }

  return { entries, load, enqueue, remove, flush };
}

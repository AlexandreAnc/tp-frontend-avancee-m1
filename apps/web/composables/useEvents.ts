import type { ClientEvent } from '#shared/types/events';

type Listener = (event: ClientEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;

function connect() {
  if (source) return;
  // EventSource se reconnecte seul après une coupure réseau.
  source = new EventSource('/api/events', { withCredentials: true });
  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as ClientEvent;
    for (const listener of listeners) listener(event);
  };
}

function disconnect() {
  source?.close();
  source = null;
}

/** S'abonne aux événements temps réel de l'utilisateur pendant la vie du composant. */
export function useEvents(listener: Listener) {
  onMounted(() => {
    listeners.add(listener);
    connect();
  });
  onBeforeUnmount(() => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  });
}

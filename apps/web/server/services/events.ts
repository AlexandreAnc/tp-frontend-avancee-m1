import { EventEmitter } from 'node:events';
import type { ClientEvent } from '#shared/types/events';

/** Bus en mémoire : les événements d'un utilisateur ne sont envoyés qu'à ses propres connexions SSE. */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const ALL_USERS = '*';

export function publishToUser(userId: string, event: ClientEvent): void {
  emitter.emit(userId, event);
}

export function publishToAll(event: ClientEvent): void {
  emitter.emit(ALL_USERS, event);
}

/** Vrai si l'utilisateur a l'app ouverte (au moins une connexion SSE). */
export function isUserConnected(userId: string): boolean {
  return emitter.listenerCount(userId) > 0;
}

export function subscribe(userId: string, listener: (event: ClientEvent) => void): () => void {
  emitter.on(userId, listener);
  emitter.on(ALL_USERS, listener);
  return () => {
    emitter.off(userId, listener);
    emitter.off(ALL_USERS, listener);
  };
}

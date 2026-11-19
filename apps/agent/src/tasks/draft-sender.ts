import { MAX_DRAFT_CHARS } from '@app/shared';

/** Un brouillon toutes les 150 ms au plus : fluide à l'écran sans un message WebSocket par mot. */
export const DRAFT_INTERVAL_MS = 150;

/**
 * Regroupe les brouillons d'une réponse : seul le dernier texte reçu pendant l'intervalle est envoyé.
 * `stop` abandonne le brouillon en attente (tâche terminée : la réponse définitive part juste après).
 */
export function createDraftSender(send: (text: string) => void, intervalMs = DRAFT_INTERVAL_MS) {
  let pending: string | null = null;
  let lastSent = '';
  let timer: NodeJS.Timeout | undefined;

  const flush = () => {
    timer = undefined;
    if (pending === null || pending === lastSent) return;
    lastSent = pending;
    pending = null;
    send(lastSent);
  };

  return {
    push(text: string): void {
      // Au-delà, le serveur refuserait le message : on tronque l'aperçu, la réponse finale reste complète.
      pending = text.slice(0, MAX_DRAFT_CHARS);
      timer ??= setTimeout(flush, intervalMs);
    },
    stop(): void {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}

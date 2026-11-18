import { MAX_CHAT_MESSAGE_LENGTH } from '@app/shared';
import { z } from 'zod';

/**
 * Messages de discussion écrits hors ligne : gardés sur l'appareil (localStorage, une file par compte)
 * et envoyés dans l'ordre au retour du réseau. Le serveur revalide chaque message comme d'habitude.
 */

const STORAGE_PREFIX = 'dashia-outbox:';

const entrySchema = z.object({
  id: z.string().min(1),
  /** `null` : nouvelle discussion, créée à l'envoi. */
  conversationId: z.string().min(1).nullable(),
  content: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
  createdAt: z.string(),
  /** Refus définitif du serveur : le message n'est plus renvoyé, l'utilisateur peut le retirer. */
  error: z.string().optional(),
});

export type OutboxEntry = z.infer<typeof entrySchema>;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function outboxKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** File d'un compte ; une valeur illisible (modifiée à la main, ancienne version) est ignorée plutôt que de casser le chat. */
export function readOutbox(storage: KeyValueStorage, key: string): OutboxEntry[] {
  try {
    const parsed = z.array(entrySchema).safeParse(JSON.parse(storage.getItem(key) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeOutbox(storage: KeyValueStorage, key: string, entries: readonly OutboxEntry[]): void {
  if (entries.length) storage.setItem(key, JSON.stringify(entries));
  else storage.removeItem(key);
}

/** À la déconnexion : les messages en attente appartiennent au compte qui part. */
export function clearOutboxes(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key?.startsWith(STORAGE_PREFIX) ?? false);
  for (const key of keys) storage.removeItem(key);
}

function statusOf(error: unknown): number | undefined {
  const { status, statusCode } = (error ?? {}) as { status?: number; statusCode?: number };
  return status ?? statusCode;
}

/** Requête restée sans réponse : appareil hors ligne ou serveur injoignable. */
export function isNetworkError(error: unknown): boolean {
  return !statusOf(error);
}

/**
 * Erreur passagère (pas de réponse, limite de débit, panne serveur) : on garde le message pour réessayer.
 * Toute autre réponse (400, 404…) est un refus définitif.
 */
export function isTransientError(error: unknown): boolean {
  const status = statusOf(error);
  return !status || status === 429 || status >= 500;
}

export type FlushOutcome = 'sent' | { error: string };

/**
 * Envoie les messages en attente dans l'ordre (ceux déjà refusés sont sautés).
 * S'arrête à la première erreur passagère : les suivants attendent, pour ne pas changer l'ordre de la discussion.
 */
export async function flushOutbox(
  entries: readonly OutboxEntry[],
  send: (entry: OutboxEntry) => Promise<void>,
  describe: (error: unknown) => string,
): Promise<Map<string, FlushOutcome>> {
  const outcomes = new Map<string, FlushOutcome>();
  for (const entry of entries) {
    if (entry.error) continue;
    try {
      await send(entry);
      outcomes.set(entry.id, 'sent');
    } catch (error) {
      if (isTransientError(error)) break;
      outcomes.set(entry.id, { error: describe(error) });
    }
  }
  return outcomes;
}

/** Applique le résultat d'un envoi à la file actuelle (qui a pu recevoir de nouveaux messages pendant l'envoi). */
export function settleOutbox(entries: readonly OutboxEntry[], outcomes: ReadonlyMap<string, FlushOutcome>): OutboxEntry[] {
  return entries.flatMap((entry) => {
    const outcome = outcomes.get(entry.id);
    if (outcome === 'sent') return [];
    return outcome ? [{ ...entry, error: outcome.error }] : [entry];
  });
}

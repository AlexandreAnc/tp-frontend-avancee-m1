import { AppError } from './errors';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Limiteur à fenêtre fixe en mémoire (une seule instance web en prod).
 * À remplacer par un stockage partagé si l'app passe sur plusieurs instances.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; message: string }) {
  const windows = new Map<string, Window>();

  return function consume(key: string, now = Date.now()): void {
    if (windows.size > 10_000) {
      for (const [entryKey, entry] of windows) {
        if (entry.resetAt <= now) windows.delete(entryKey);
      }
    }
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      return;
    }
    if (current.count >= options.limit) {
      throw new AppError('rate_limited', options.message, { retryAfterMs: current.resetAt - now });
    }
    current.count += 1;
  };
}

export const chatRateLimit = createRateLimiter({
  limit: 20,
  windowMs: 60_000,
  message: 'Trop de messages envoyés. Réessayez dans une minute.',
});

export const uploadRateLimit = createRateLimiter({
  limit: 30,
  windowMs: 10 * 60_000,
  message: "Trop d'envois de fichiers. Réessayez dans quelques minutes.",
});

/** Pages et téléchargements publics des liens de partage, par adresse IP. */
export const shareRateLimit = createRateLimiter({
  limit: 60,
  windowMs: 60_000,
  message: 'Trop de requêtes. Réessayez dans une minute.',
});

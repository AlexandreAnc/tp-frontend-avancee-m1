export const APP_ERROR_CODES = {
  unauthorized: 401,
  /** Action sensible : une vérification biométrique récente (passkey) est nécessaire. */
  step_up_required: 403,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  file_too_large: 413,
  unsupported_file_type: 415,
  quota_exceeded: 409,
  rate_limited: 429,
  action_expired: 410,
  connector_missing: 412,
  agent_unavailable: 503,
  upstream: 502,
} as const;

export type AppErrorCode = keyof typeof APP_ERROR_CODES;

/** Erreur métier typée. Le message est destiné à l'utilisateur (en français). */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} introuvable`);

import type { InternalApi } from 'nitropack/types';

/** Type de la réponse d'une route API (pour les URL dynamiques, que `$fetch` ne sait pas typer seul). */
export type ApiResponse<Route extends keyof InternalApi, Method extends keyof InternalApi[Route]> = InternalApi[Route][Method];

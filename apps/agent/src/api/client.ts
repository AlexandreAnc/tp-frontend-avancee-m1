import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AGENT_API_PREFIX,
  agendaResponseSchema,
  chatLlmConfigSchema,
  homeStateSchema,
  createActionResponseSchema,
  exactSearchResponseSchema,
  fileIndexResultSchema,
  listFilesResponseSchema,
  readFileResponseSchema,
  semanticSearchResponseSchema,
  toolDefinitions,
  type IndexFileRequest,
  type ProposedAction,
} from '@app/shared';
import type { z } from 'zod';
import { TaskError } from '../tasks/errors';

/** Statuts pour lesquels réessayer ne changerait rien (token expiré, fichier supprimé, données refusées). */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 410, 413, 415, 422]);

/**
 * Client de l'API de prod, authentifié par le token de la tâche en cours.
 * C'est le seul accès de l'agent aux données : il n'a jamais accès à la base.
 */
export class ApiClient {
  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly signal: AbortSignal,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(new URL(`${AGENT_API_PREFIX}${path}`, this.serverUrl), {
        ...init,
        signal: this.signal,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (this.signal.aborted) throw error;
      throw new TaskError(`Serveur injoignable : ${error instanceof Error ? error.message : String(error)}`, true);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      const retryable = !NON_RETRYABLE_STATUSES.has(response.status);
      throw new TaskError(
        `API ${path} : ${response.status} ${body?.message ?? response.statusText}`,
        retryable,
        retryable || response.status === 401 || response.status === 403,
      );
    }
    return response;
  }

  private async json<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
    const response = await this.request(path, init);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new TaskError(`Réponse inattendue de ${path}`, false);
    return parsed.data;
  }

  /** IA de conversation choisie par l'utilisateur (clé incluse) : réponses du chat uniquement. */
  getChatLlmConfig() {
    return this.json(chatLlmConfigSchema, '/llm');
  }

  listFiles() {
    return this.json(listFilesResponseSchema, '/files');
  }

  readFile(fileId: string, offset = 0) {
    return this.json(readFileResponseSchema, `/files/${fileId}/text?offset=${offset}`);
  }

  /** Télécharge le fichier original en flux vers `destination`. */
  async downloadFile(fileId: string, destination: string): Promise<void> {
    const response = await this.request(`/files/${fileId}/raw`);
    if (!response.body) throw new TaskError('Fichier vide reçu du serveur', true);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  }

  saveIndex(fileId: string, data: IndexFileRequest) {
    return this.json(fileIndexResultSchema, `/files/${fileId}/index-data`, { method: 'PUT', body: JSON.stringify(data) });
  }

  semanticSearch(body: { embedModel: string; embedding: number[]; limit: number }) {
    return this.json(semanticSearchResponseSchema, '/search/semantic', { method: 'POST', body: JSON.stringify(body) });
  }

  exactSearch(body: { query: string; limit: number }) {
    return this.json(exactSearchResponseSchema, '/search/exact', { method: 'POST', body: JSON.stringify(body) });
  }

  listRoutines() {
    return this.json(toolDefinitions.list_routines.output, '/routines');
  }

  runRoutine(routineId: string) {
    return this.json(toolDefinitions.run_routine.output, `/routines/${routineId}/run`, { method: 'POST' });
  }

  getHome() {
    return this.json(homeStateSchema, '/home');
  }

  getAgenda(range: { from: string; to: string }) {
    const query = new URLSearchParams(range).toString();
    return this.json(agendaResponseSchema, `/agenda?${query}`);
  }

  /** Demande une action : exécutée directement si sans risque, sinon soumise à la validation de l'utilisateur. */
  requestAction(action: ProposedAction, summary: string) {
    return this.json(createActionResponseSchema, '/actions', { method: 'POST', body: JSON.stringify({ action, summary }) });
  }
}

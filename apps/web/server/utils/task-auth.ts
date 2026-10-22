import type { H3Event } from 'h3';
import { getRequestHeader } from 'h3';
import { verifyTaskToken, type TaskTokenScope } from '../services/task-tokens';
import { AppError } from './errors';

/** Authentifie un appel d'outil de l'agent avec son token de tâche (`Authorization: Bearer …`). */
export async function requireTaskToken(event: H3Event): Promise<TaskTokenScope> {
  const header = getRequestHeader(event, 'authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) throw new AppError('unauthorized', 'Token de tâche manquant');
  return verifyTaskToken(token);
}

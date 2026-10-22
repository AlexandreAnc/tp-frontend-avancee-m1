import type { H3Event } from 'h3';
import { getAuth } from './auth';
import { getEnv } from './env';
import { AppError } from './errors';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Session courante (la validation forte par passkey est rattachée à la session). */
  sessionId: string;
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: event.headers });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, sessionId: session.session.id };
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!user) {
    throw new AppError('unauthorized', 'Vous devez être connecté');
  }
  return user;
}

export function isAdmin(user: SessionUser): boolean {
  return getEnv().ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event);
  if (!isAdmin(user)) {
    throw new AppError('forbidden', 'Accès réservé aux administrateurs');
  }
  return user;
}

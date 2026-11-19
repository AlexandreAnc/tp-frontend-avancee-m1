import type { H3Event } from 'h3';
import { getAuth } from './auth';
import { getEnv } from './env';
import { AppError } from './errors';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Adresse confirmée. Sans vérification d'e-mail à l'inscription, seul l'exploitant la confirme (`pnpm --filter web admin:grant`). */
  emailVerified: boolean;
  /** Session courante (la validation forte par passkey est rattachée à la session). */
  sessionId: string;
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: event.headers });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
    sessionId: session.session.id,
  };
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!user) {
    throw new AppError('unauthorized', 'Vous devez être connecté');
  }
  return user;
}

/**
 * Admin = adresse listée dans `ADMIN_EMAILS` **et** confirmée. L'inscription ne vérifie pas l'e-mail : sans la
 * seconde condition, s'inscrire le premier avec une adresse admin donnerait l'accès aux clés d'agent, donc aux
 * tâches de tous les comptes.
 */
export function isAdmin(user: Pick<SessionUser, 'email' | 'emailVerified'>): boolean {
  return user.emailVerified && getEnv().ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event);
  if (!isAdmin(user)) {
    throw new AppError('forbidden', 'Accès réservé aux administrateurs');
  }
  return user;
}

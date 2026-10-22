import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '../db';
import { getEnv } from '../utils/env';
import { AppError } from '../utils/errors';
import { getSettings } from './settings';

const { passkey, stepUps } = schema;

/** Durée de validité d'une vérification biométrique pour les actions sensibles. */
export const STEP_UP_MAX_AGE_MS = 5 * 60 * 1000;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** Défis en cours, par session (une seule instance web ; durée de vie de 2 minutes). */
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

function relyingParty() {
  const url = new URL(getEnv().BETTER_AUTH_URL);
  return { rpID: url.hostname, origin: url.origin };
}

export async function hasPasskey(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1);
  return Boolean(row);
}

/** Options WebAuthn pour vérifier l'utilisateur avec une de ses passkeys (Face ID, empreinte). */
export async function createStepUpOptions(userId: string, sessionId: string) {
  const credentials = await db.select({ credentialID: passkey.credentialID, transports: passkey.transports })
    .from(passkey).where(eq(passkey.userId, userId));
  if (credentials.length === 0) {
    throw new AppError('validation', 'Ajoutez d’abord Face ID ou votre empreinte dans les réglages.');
  }
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    userVerification: 'required',
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialID,
      transports: credential.transports ? credential.transports.split(',') as AuthenticatorTransportFuture[] : undefined,
    })),
  });
  challenges.set(sessionId, { challenge: options.challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return options;
}

/** Vérifie la signature biométrique et la rattache à la session. */
export async function verifyStepUp(userId: string, sessionId: string, response: AuthenticationResponseJSON): Promise<void> {
  const pending = challenges.get(sessionId);
  challenges.delete(sessionId);
  if (!pending || pending.expiresAt < Date.now()) throw new AppError('unauthorized', 'Vérification expirée, recommencez.');

  const [credential] = await db.select().from(passkey)
    .where(and(eq(passkey.userId, userId), eq(passkey.credentialID, response.id)));
  if (!credential) throw new AppError('unauthorized', 'Passkey inconnue pour ce compte.');

  const { rpID, origin } = relyingParty();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credential.credentialID,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
      counter: credential.counter,
    },
  }).catch(() => ({ verified: false as const, authenticationInfo: null }));
  if (!verification.verified) throw new AppError('unauthorized', 'Vérification biométrique refusée.');

  await db.update(passkey).set({ counter: verification.authenticationInfo.newCounter }).where(eq(passkey.id, credential.id));
  await db.insert(stepUps).values({ sessionId, verifiedAt: new Date() })
    .onConflictDoUpdate({ target: stepUps.sessionId, set: { verifiedAt: new Date() } });
}

export async function hasRecentStepUp(sessionId: string): Promise<boolean> {
  const [row] = await db.select({ sessionId: stepUps.sessionId }).from(stepUps)
    .where(and(eq(stepUps.sessionId, sessionId), gt(stepUps.verifiedAt, new Date(Date.now() - STEP_UP_MAX_AGE_MS))));
  return Boolean(row);
}

/**
 * Exige une vérification biométrique récente pour une opération sensible, si l'utilisateur
 * a une passkey et n'a pas désactivé l'option. Sans passkey, la session suffit.
 */
export async function requireStepUpIfEnabled(userId: string, sessionId: string): Promise<void> {
  const settings = await getSettings(userId);
  if (!settings.biometricForSensitive || !await hasPasskey(userId)) return;
  if (!await hasRecentStepUp(sessionId)) {
    throw new AppError('step_up_required', 'Confirmez avec Face ID ou votre empreinte pour continuer.');
  }
}

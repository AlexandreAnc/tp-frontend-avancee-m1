import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { AppError } from '../utils/errors';
import { getSettings } from './settings';

const { userSettings } = schema;
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** Après 5 essais faux, le code est bloqué 15 minutes (un code à 6 chiffres ne résiste pas sans cette limite). */
export const MAX_PIN_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const KEY_LENGTH = 32;

export const PIN_PATTERN = /^\d{6}$/;

async function hashPin(pin: string, salt = randomBytes(16)): Promise<string> {
  const hash = await scryptAsync(pin, salt, KEY_LENGTH);
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

async function matches(pin: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = await scryptAsync(pin, Buffer.from(salt, 'base64'), KEY_LENGTH);
  return timingSafeEqual(actual, Buffer.from(expected, 'base64'));
}

export async function setUnlockPin(userId: string, pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new AppError('validation', 'Le code doit comporter 6 chiffres.');
  await getSettings(userId);
  await db.update(userSettings)
    .set({ unlockPinHash: await hashPin(pin), unlockPinFailures: 0, unlockPinLockedUntil: null })
    .where(eq(userSettings.userId, userId));
}

export async function removeUnlockPin(userId: string): Promise<void> {
  await getSettings(userId);
  await db.update(userSettings)
    .set({ unlockPinHash: null, unlockPinFailures: 0, unlockPinLockedUntil: null })
    .where(eq(userSettings.userId, userId));
}

/** Vérifie le code de secours, avec blocage temporaire après `MAX_PIN_FAILURES` erreurs. */
export async function verifyUnlockPin(userId: string, pin: string, now = new Date()): Promise<void> {
  const settings = await getSettings(userId);
  if (!settings.unlockPinHash) throw new AppError('conflict', 'Aucun code de secours n’est défini.');
  if (settings.unlockPinLockedUntil && settings.unlockPinLockedUntil > now) {
    throw new AppError('rate_limited', 'Trop d’essais : réessayez dans quelques minutes, ou utilisez Face ID / votre mot de passe.', {
      retryAfterMs: settings.unlockPinLockedUntil.getTime() - now.getTime(),
    });
  }

  if (PIN_PATTERN.test(pin) && await matches(pin, settings.unlockPinHash)) {
    await db.update(userSettings).set({ unlockPinFailures: 0, unlockPinLockedUntil: null }).where(eq(userSettings.userId, userId));
    return;
  }

  const failures = settings.unlockPinFailures + 1;
  const locked = failures >= MAX_PIN_FAILURES;
  await db.update(userSettings).set({
    unlockPinFailures: locked ? 0 : failures,
    unlockPinLockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : null,
  }).where(eq(userSettings.userId, userId));
  throw new AppError(
    'forbidden',
    locked ? 'Code incorrect. Trop d’essais : le code est bloqué 15 minutes.' : `Code incorrect. ${MAX_PIN_FAILURES - failures} essai${MAX_PIN_FAILURES - failures > 1 ? 's' : ''} restant${MAX_PIN_FAILURES - failures > 1 ? 's' : ''}.`,
  );
}

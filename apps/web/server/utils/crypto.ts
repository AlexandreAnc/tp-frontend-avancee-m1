import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from './env';

/** Token aléatoire url-safe (256 bits), avec préfixe optionnel lisible (ex. `agk_`). */
export function generateToken(prefix = ''): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

/** Hash pour stocker un token en base (tokens à forte entropie : un hash rapide suffit). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

const ALGORITHM = 'aes-256-gcm';

/** Chiffre une valeur sensible (tokens OAuth). Format : iv.tag.ciphertext en base64url. */
export function encrypt(plaintext: string, key = getEnv().ENCRYPTION_KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decrypt(payload: string, key = getEnv().ENCRYPTION_KEY): string {
  const [iv, tag, ciphertext] = payload.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !ciphertext) {
    throw new Error('Valeur chiffrée invalide');
  }
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key, 'base64'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

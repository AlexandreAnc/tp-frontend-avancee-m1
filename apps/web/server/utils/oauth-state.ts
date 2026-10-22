import type { H3Event } from 'h3';
import { deleteCookie, getCookie, setCookie } from 'h3';
import { generateToken, safeEqual } from './crypto';

const cookieName = (provider: string) => `${provider}_oauth_state`;
const cookiePath = (provider: string) => `/api/connectors/${provider}`;

/** Crée le `state` anti-CSRF d'un consentement OAuth et le garde dans un cookie httpOnly. */
export function createOAuthState(event: H3Event, provider: string): string {
  const state = generateToken();
  setCookie(event, cookieName(provider), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    maxAge: 600,
    path: cookiePath(provider),
  });
  return state;
}

/** Vérifie (et consomme) le `state` renvoyé par le fournisseur OAuth. */
export function consumeOAuthState(event: H3Event, provider: string, received: string | undefined): boolean {
  const expected = getCookie(event, cookieName(provider));
  deleteCookie(event, cookieName(provider), { path: cookiePath(provider) });
  return Boolean(expected && received && safeEqual(expected, received));
}

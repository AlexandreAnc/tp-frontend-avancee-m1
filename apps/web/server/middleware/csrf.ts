import { createError, defineEventHandler, getRequestHeader } from 'h3';
import { isCrossSiteRequest } from '../utils/csrf';
import { getEnv } from '../utils/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Exemptées : l'agent s'authentifie par token (pas de cookie à détourner), Better Auth contrôle lui-même l'origine. */
const EXEMPT_PREFIXES = ['/api/agent/', '/api/auth/'];

export default defineEventHandler((event) => {
  if (SAFE_METHODS.has(event.method) || !event.path.startsWith('/api/')) return;
  if (EXEMPT_PREFIXES.some((prefix) => event.path.startsWith(prefix))) return;
  const request = { origin: getRequestHeader(event, 'origin'), fetchSite: getRequestHeader(event, 'sec-fetch-site') };
  if (isCrossSiteRequest(request, getEnv().BETTER_AUTH_URL, process.env.NODE_ENV === 'production')) {
    throw createError({ statusCode: 403, message: 'Requête refusée : elle ne vient pas de DashIA.' });
  }
});

import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

/**
 * En production, Cloudflare (le proxy devant le site) injecte ses propres scripts dans le HTML :
 * la détection de bots par JavaScript (`/cdn-cgi/challenge-platform/`, impossible à couper sur l'offre gratuite)
 * et, s'il est activé, le script de Web Analytics. Notre CSP les bloque, c'est voulu : ce ne sont pas nos scripts.
 *
 * Ces blocages sont reconnus précisément, jamais par un filtre large :
 * - un script externe, par son adresse (`/cdn-cgi/` ou `static.cloudflareinsights.com`) ;
 * - un script en ligne, par l'empreinte SHA-256 que Chrome cite dans son message : elle doit correspondre
 *   à un script de la page qui charge `/cdn-cgi/challenge-platform/`.
 * Toute autre erreur (un de nos scripts bloqué, une erreur JavaScript) reste une erreur.
 */
const EDGE_SCRIPT_URL = /https:\/\/static\.cloudflareinsights\.com\/|\/cdn-cgi\//;
const EDGE_INLINE_MARKER = '/cdn-cgi/challenge-platform/';
const CSP_MESSAGE = /Content Security Policy/i;
const SUGGESTED_HASH = /'(sha256-[A-Za-z0-9+/=]+)'/g;

function sha256(source: string): string {
  return `sha256-${createHash('sha256').update(source).digest('base64')}`;
}

/** Empreintes des scripts en ligne injectés par Cloudflare dans la page affichée. */
async function edgeInlineHashes(page: Page): Promise<Set<string>> {
  const sources = await page.locator('script:not([src])').evaluateAll((scripts) => scripts.map((script) => script.textContent ?? ''));
  return new Set(sources.filter((source) => source.includes(EDGE_INLINE_MARKER)).map(sha256));
}

function isEdgeBlock(message: string, edgeHashes: Set<string>): boolean {
  if (!CSP_MESSAGE.test(message)) return false;
  if (EDGE_SCRIPT_URL.test(message)) return true;
  // Le message cite les empreintes de la directive, puis celle du script bloqué (« a hash ('sha256-…') »).
  return [...message.matchAll(SUGGESTED_HASH)].some(([, hash]) => hash !== undefined && edgeHashes.has(hash));
}

/**
 * Écoute la console de la page. `errors()` renvoie les erreurs (ou, avec `cspOnly`, les blocages CSP)
 * qui ne viennent pas d'une injection de Cloudflare.
 */
export function watchConsole(page: Page, { cspOnly = false } = {}) {
  const messages: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (cspOnly ? CSP_MESSAGE.test(text) : message.type() === 'error') messages.push(text);
  });
  return {
    async errors(): Promise<string[]> {
      const edgeHashes = await edgeInlineHashes(page);
      return messages.filter((message) => !isEdgeBlock(message, edgeHashes));
    },
  };
}

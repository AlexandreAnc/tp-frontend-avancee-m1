import { createHash } from 'node:crypto';

/** Scripts en ligne exécutés par le navigateur : tout sauf les données (`application/json`, JSON-LD). */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
const DATA_TYPES = /type=["']?application\/(ld\+)?json/i;

/** Empreintes SHA-256 des scripts en ligne d'une page : seuls eux pourront s'exécuter, pas un script injecté (XSS). */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const [, attributes, content] of html.matchAll(INLINE_SCRIPT)) {
    if (DATA_TYPES.test(attributes!)) continue;
    hashes.add(`'sha256-${createHash('sha256').update(content!).digest('base64')}'`);
  }
  return [...hashes];
}

/**
 * Content Security Policy d'une page, posée en `<meta>` pour valoir aussi dans le HTML pré-rendu.
 * - Scripts : uniquement les fichiers du site et les scripts en ligne de cette page (par empreinte), jamais `unsafe-inline`.
 * - Styles en ligne autorisés : Vue pose des attributs `style` (tailles d'icônes), sans risque d'exécution de code.
 * - Tout le reste (API, flux d'événements, images, polices, service worker) vient du même domaine.
 * Les directives réservées à l'en-tête HTTP (`frame-ancestors`) sont dans les `routeRules`.
 */
export function contentSecurityPolicy(html: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // Vite intègre les petits sous-ensembles de la police Manrope dans la CSS, en `data:`.
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "frame-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

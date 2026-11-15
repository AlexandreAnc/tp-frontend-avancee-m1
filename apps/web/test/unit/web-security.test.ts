import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes } from '../../server/utils/csp';
import { isCrossSiteRequest } from '../../server/utils/csrf';

const APP = 'https://dashia.example';

describe('Content Security Policy', () => {
  const page = [
    '<script type="importmap">{"imports":{}}</script>',
    '<script>window.__NUXT__={}</script>',
    '<script type="module" src="/_nuxt/entry.js"></script>',
    '<script type="application/ld+json">{"@type":"WebSite"}</script>',
    '<script type="application/json" id="__NUXT_DATA__">[1]</script>',
  ].join('');

  it('autorise chaque script en ligne de la page par son empreinte, pas les données JSON', () => {
    const hashes = inlineScriptHashes(page);
    expect(hashes).toHaveLength(2);
    // Empreinte SHA-256 de `window.__NUXT__={}`, calculée à part avec openssl : un script injecté aurait une autre empreinte.
    expect(hashes).toContain("'sha256-9t9kOTpBXQ6UK6UoTUcY2ezm5KT7oB5pbv8ZFsTUBAU='");
  });

  it('ne permet jamais les scripts en ligne arbitraires ni les plugins', () => {
    const policy = contentSecurityPolicy(page);
    const scriptSrc = policy.split('; ').find((directive) => directive.startsWith('script-src'))!;
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });
});

describe('protection CSRF', () => {
  it('accepte une requête du site', () => {
    expect(isCrossSiteRequest({ origin: APP }, APP, true)).toBe(false);
    expect(isCrossSiteRequest({ fetchSite: 'same-origin' }, APP, true)).toBe(false);
  });

  it('refuse une requête venue d’un autre site, ou d’un contexte opaque', () => {
    expect(isCrossSiteRequest({ origin: 'https://evil.example' }, APP, true)).toBe(true);
    expect(isCrossSiteRequest({ origin: 'null' }, APP, true)).toBe(true);
    expect(isCrossSiteRequest({ fetchSite: 'cross-site' }, APP, true)).toBe(true);
  });

  it('accepte les tunnels de développement seulement hors production', () => {
    const tunnel = { origin: 'https://abc-def.trycloudflare.com' };
    expect(isCrossSiteRequest(tunnel, APP, false)).toBe(false);
    expect(isCrossSiteRequest(tunnel, APP, true)).toBe(true);
  });

  it('laisse passer un client sans navigateur (pas de cookie, rien à détourner)', () => {
    expect(isCrossSiteRequest({}, APP, true)).toBe(false);
  });
});

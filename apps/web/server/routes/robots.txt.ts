import { defineEventHandler, setHeader } from 'h3';
import { SITE, absoluteUrl } from '#shared/site';

/** Projet de cours : tout est bloqué. Site indexable : seul le site public l'est, l'app et l'API sont réservées aux comptes. */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  if (!SITE.indexable) {
    return [
      '# DashIA est un projet de cours (TP de Master 1), pas un service commercial.',
      '# Merci de ne rien explorer ni indexer : les contenus du blog sont fictifs.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }
  return [
    'User-agent: *',
    'Allow: /$',
    'Allow: /blog',
    'Allow: /accessibilite',
    'Allow: /llms.txt',
    'Allow: /icons/',
    'Allow: /og-image.png',
    'Allow: /_nuxt/',
    'Disallow: /',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
});

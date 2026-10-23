import { defineEventHandler, setHeader } from 'h3';
import { absoluteUrl } from '#shared/site';

/** Seul le site public est indexable : l'app et l'API sont réservées aux comptes. */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
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

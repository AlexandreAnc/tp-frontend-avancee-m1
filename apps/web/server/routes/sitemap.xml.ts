import { defineEventHandler, setHeader } from 'h3';
import { ARTICLES } from '#shared/blog';
import { absoluteUrl } from '#shared/site';

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8');
  const latest = ARTICLES.map((article) => article.updatedAt).sort().at(-1)!;
  const urls = [
    { path: '/', lastmod: latest },
    { path: '/blog', lastmod: latest },
    ...ARTICLES.map((article) => ({ path: `/blog/${article.slug}`, lastmod: article.updatedAt })),
    { path: '/accessibilite', lastmod: '2026-10-23' },
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${absoluteUrl(url.path)}</loc><lastmod>${url.lastmod}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');
});

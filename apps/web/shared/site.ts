/** Identité du site public, partagée par les pages, le sitemap, robots.txt et llms.txt. */
export const SITE = {
  name: 'DashIA',
  /** URL canonique : figée au build (les pages publiques sont pré-rendues). */
  url: (process.env.NUXT_PUBLIC_SITE_URL ?? 'https://tp-developpement-fullstack-m1.aanc.fr').replace(/\/$/, ''),
  tagline: 'Votre assistant IA personnel, qui travaille chez vous',
  description: "DashIA est un assistant IA personnel : il range et comprend vos documents, gère vos échéances et pilote votre maison, avec un modèle qui tourne sur votre propre machine.",
  locale: 'fr_FR',
} as const;

/** Pages du site public (pré-rendues, indexées) ; tout le reste est l'app, réservée aux comptes. */
export function isMarketingPath(path: string): boolean {
  return path === '/' || path === '/accessibilite' || path === '/blog' || path.startsWith('/blog/');
}

export function absoluteUrl(path: string): string {
  return `${SITE.url}${path === '/' ? '/' : path}`;
}

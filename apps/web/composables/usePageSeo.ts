import { SITE, absoluteUrl } from '#shared/site';

interface PageSeo {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
  /** Données structurées schema.org (JSON-LD), lues par les moteurs de recherche et de réponse. */
  jsonLd?: Record<string, unknown>[];
  publishedAt?: string;
  updatedAt?: string;
}

/** Balises SEO d'une page publique : titre, description, URL canonique, Open Graph et JSON-LD. */
export function usePageSeo(page: PageSeo) {
  const url = absoluteUrl(page.path);
  const image = absoluteUrl('/og-image.png');
  useSeoMeta({
    title: page.title,
    description: page.description,
    ogTitle: page.title,
    ogDescription: page.description,
    ogType: page.type ?? 'website',
    ogUrl: url,
    ogSiteName: SITE.name,
    ogLocale: SITE.locale,
    ogImage: image,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: `${SITE.name} : ${SITE.tagline}`,
    twitterCard: 'summary_large_image',
    articlePublishedTime: page.publishedAt,
    articleModifiedTime: page.updatedAt,
    // Projet de cours : pas d'indexation, même si une page est trouvée par un lien externe.
    robots: SITE.indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
  });
  useHead({
    link: [{ rel: 'canonical', href: url }],
    script: (page.jsonLd ?? []).map((data) => ({
      type: 'application/ld+json',
      // `<` échappé : un texte ne peut pas fermer la balise script.
      innerHTML: JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c'),
    })),
  });
}

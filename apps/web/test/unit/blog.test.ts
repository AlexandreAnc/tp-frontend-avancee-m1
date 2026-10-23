import { describe, expect, it } from 'vitest';
import { ARTICLES, getArticle, internalLinks, plainText } from '../../shared/blog';

/** Ancres de la landing citées par les articles : doivent exister dans `pages/index.vue`. */
const LANDING_ANCHORS = ['fonctionnalites', 'securite', 'agents', 'ia-au-choix', 'faq', 'comment-ca-marche'];
const PILLAR = 'assistant-ia-personnel-guide';

describe('maillage interne du blog', () => {
  it('ne contient aucun lien mort (article, section ou ancre de la landing)', () => {
    for (const article of ARTICLES) {
      for (const link of internalLinks(article)) {
        const [path, anchor] = link.split('#');
        if (path === '/') {
          expect(LANDING_ANCHORS, `${article.slug} → ${link}`).toContain(anchor);
          continue;
        }
        const target = getArticle(path!.replace(/^\/blog\//, ''));
        expect(target, `${article.slug} → ${link}`).toBeDefined();
        if (anchor) expect(target!.sections.map((section) => section.id).concat('faq'), `${article.slug} → ${link}`).toContain(anchor);
      }
    }
  });

  it('relie le pilier à chaque article, et chaque article au pilier', () => {
    const pillar = getArticle(PILLAR)!;
    const fromPillar = new Set([...internalLinks(pillar), ...pillar.related.map((slug) => `/blog/${slug}`)].map((link) => link.split('#')[0]));
    for (const article of ARTICLES.filter((candidate) => candidate.slug !== PILLAR)) {
      expect(fromPillar, `pilier → ${article.slug}`).toContain(`/blog/${article.slug}`);
      expect(internalLinks(article).some((link) => link.startsWith(`/blog/${PILLAR}`)) || article.related.includes(PILLAR), `${article.slug} → pilier`).toBe(true);
    }
  });

  it('a des métadonnées exploitables par les moteurs', () => {
    const slugs = new Set<string>();
    for (const article of ARTICLES) {
      expect(slugs.has(article.slug)).toBe(false);
      slugs.add(article.slug);
      expect(article.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(article.description.length, article.slug).toBeGreaterThanOrEqual(120);
      expect(article.description.length, article.slug).toBeLessThanOrEqual(170);
      expect(article.summary.length).toBeGreaterThanOrEqual(2);
      expect(article.related.every((slug) => getArticle(slug) && slug !== article.slug)).toBe(true);
      expect(article.updatedAt >= article.publishedAt).toBe(true);
    }
  });

  it('retire la syntaxe des liens et du gras du texte brut', () => {
    expect(plainText('Voir **ceci** et [le guide](/blog/x).')).toBe('Voir ceci et le guide.');
  });
});

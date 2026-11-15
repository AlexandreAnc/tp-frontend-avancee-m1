import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { getArticle } from '../shared/blog';

// Démo du TP : le même article en CSR, SSR et SSG (mesures dans docs/RENDU.md).
const SLUG = 'assistant-ia-personnel-guide';
const article = getArticle(SLUG)!;

test.describe('modes de rendu', () => {
  test('SSR et SSG envoient l’article dans le HTML, le CSR une page vide', async ({ request }) => {
    for (const mode of ['ssr', 'ssg']) {
      const html = await (await request.get(`/rendu/${mode}/${SLUG}`)).text();
      expect(html, mode).toContain(article.title);
      expect(html, mode).toContain(article.sections[0]!.heading);
    }
    const csr = await (await request.get(`/rendu/csr/${SLUG}`)).text();
    expect(csr).not.toContain(article.title);
    expect(csr).toContain('<div id="__nuxt"></div>');
  });

  for (const mode of ['csr', 'ssr', 'ssg']) {
    test(`${mode.toUpperCase()} affiche le même article, accessible`, async ({ page }) => {
      await page.goto(`/rendu/${mode}/${SLUG}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(article.title);
      await expect(page.getByTestId('render-mode')).toHaveText(mode.toUpperCase());
      await expect(page.locator('article section[id]')).toHaveCount(article.sections.length + 1);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(violations.map((violation) => violation.id)).toEqual([]);
    });
  }

  test('un article inconnu renvoie une 404 en SSR', async ({ request }) => {
    expect((await request.get('/rendu/ssr/article-inconnu')).status()).toBe(404);
  });
});

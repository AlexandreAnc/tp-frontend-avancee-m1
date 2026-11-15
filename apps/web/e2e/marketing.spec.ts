import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ARTICLES } from '../shared/blog';

// Site public : sans écriture, donc aussi lancé contre la prod après chaque déploiement.
const PUBLIC_PAGES = ['/', '/blog', ...ARTICLES.map((article) => `/blog/${article.slug}`), '/accessibilite'];
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('accessibilité (axe-core, WCAG 2.2 AA)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const path of [...PUBLIC_PAGES, '/login']) {
      test(`${path} en thème ${colorScheme === 'light' ? 'clair' : 'sombre'}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(violations.map((violation) => `${violation.id} : ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  }
});

test.describe('navigation au clavier', () => {
  test('le lien d’évitement est le premier élément et mène au contenu', async ({ page }) => {
    await page.goto('/blog');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#contenu$/);
  });

  test('le menu mobile et les questions fréquentes s’ouvrent sans souris', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const menu = page.locator('header summary');
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation', { name: 'Navigation principale (mobile)' }).getByRole('link', { name: 'Blog' })).toBeVisible();

    const question = page.locator('#faq summary').first();
    await question.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#faq details').first()).toHaveAttribute('open', '');
  });
});

test.describe('SEO et GEO', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} : HTML complet, sans JavaScript ni erreur console, balises et données structurées`, async ({ page, request }) => {
      // Ce que voit un robot : le HTML brut, avant tout JavaScript.
      const html = await (await request.get(path)).text();
      expect(html).toContain('<h1');
      expect(html).not.toMatch(/<script[^>]+src=/);

      const consoleErrors: string[] = [];
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(consoleErrors).toEqual([]);
      await expect(page.locator('h1')).toHaveCount(1);
      expect((await page.title()).length).toBeGreaterThan(20);
      expect(await page.locator('meta[name="description"]').getAttribute('content')).toMatch(/.{100,}/);
      expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(new RegExp(`${path === '/' ? '/' : path}$`));
      expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');
      expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/og-image\.png$/);
      const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(jsonLd.length).toBeGreaterThan(0);
      for (const block of jsonLd) expect(JSON.parse(block)['@context']).toBe('https://schema.org');
    });
  }

  test('aucun lien interne cassé, ancres comprises', async ({ page, request }) => {
    const checked = new Set<string>();
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const hrefs = await page.locator('main a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')!));
      for (const href of new Set(hrefs)) {
        const [target, anchor] = href.split('#');
        const key = `${target}#${anchor ?? ''}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const response = await request.get(target || path);
        expect(response.status(), `${path} → ${href}`).toBe(200);
        if (anchor) expect(await response.text(), `${path} → ${href}`).toContain(`id="${anchor}"`);
      }
    }
  });

  test('sitemap, robots.txt et llms.txt décrivent le site public', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const path of PUBLIC_PAGES) expect(sitemap).toContain(`${path === '/' ? '' : path}</loc>`);
    const robots = await (await request.get('/robots.txt')).text();
    // Projet de cours : rien n'est exploré ni indexé.
    expect(robots).toContain('# DashIA est un projet de cours');
    expect(robots).toMatch(/User-agent: \*\nDisallow: \/\n/);
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms).toMatch(/^# DashIA/);
    for (const article of ARTICLES) expect(llms).toContain(article.title);
  });

  test('un article inconnu renvoie une vraie 404', async ({ request }) => {
    expect((await request.get('/blog/article-qui-n-existe-pas')).status()).toBe(404);
  });
});

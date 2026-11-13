import { expect, test } from '@playwright/test';

// Phase 4 du TP : Content Security Policy, XSS et CSRF, vérifiés dans un vrai navigateur.
const PAGES = ['/', '/blog/assistant-ia-personnel-guide', '/rendu/csr/assistant-ia-personnel-guide', '/rendu/ssr/assistant-ia-personnel-guide', '/login'];

test.describe('Content Security Policy', () => {
  for (const path of PAGES) {
    test(`${path} : politique stricte, aucun script légitime bloqué`, async ({ page }) => {
      const violations: string[] = [];
      page.on('console', (message) => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()); });
      const response = await page.goto(path, { waitUntil: 'networkidle' });

      expect(response!.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      expect(policy).toMatch(/script-src 'self'/);
      expect(policy).not.toContain('unsafe-inline\' \'sha');
      expect(policy!.split('; ').find((directive) => directive.startsWith('script-src'))).not.toContain('unsafe-inline');
      await expect(page.locator('h1')).toBeVisible();
      expect(violations).toEqual([]);
    });
  }

  test('un script injecté dans la page (XSS) ne s’exécute pas', async ({ page }) => {
    await page.goto('/rendu/csr/assistant-ia-personnel-guide', { waitUntil: 'networkidle' });
    const outcome = await page.evaluate(async () => {
      const blocked = new Promise<string>((resolve) => document.addEventListener('securitypolicyviolation', (event) => resolve(event.violatedDirective), { once: true }));
      const script = document.createElement('script');
      script.textContent = 'window.__xss = true';
      document.body.append(script);
      return { executed: Boolean((window as unknown as { __xss?: boolean }).__xss), directive: await blocked };
    });
    expect(outcome).toEqual({ executed: false, directive: expect.stringMatching(/^script-src/) });
  });
});

test.describe('protection CSRF', () => {
  test('refuse une modification venue d’un autre site', async ({ request }) => {
    const response = await request.patch('/api/settings', { headers: { origin: 'https://evil.example' }, data: { theme: 'dark' } });
    expect(response.status()).toBe(403);
  });

  test('laisse passer la même requête venue du site (puis exige une session)', async ({ request, baseURL }) => {
    const response = await request.patch('/api/settings', { headers: { origin: new URL(baseURL!).origin }, data: { theme: 'dark' } });
    expect(response.status()).toBe(401);
  });
});

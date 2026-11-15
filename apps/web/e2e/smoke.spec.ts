import { expect, test } from '@playwright/test';

// Sans écriture : sûrs à lancer contre la prod après chaque déploiement.
test.describe('smoke', () => {
  test('un visiteur non connecté arrive sur la connexion', async ({ page }) => {
    await page.goto('/drive');
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)drive/);
    await expect(page.getByRole('heading', { name: 'DashIA' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Inscription' })).toBeVisible();
  });

  test('les vérifications de session tiennent la charge d’une navigation normale', async ({ request }) => {
    // Non-régression : en prod, la 31ᵉ vérification de la minute renvoyait 429 et déconnectait tout le monde.
    for (let index = 0; index < 40; index++) {
      const response = await request.get('/api/auth/get-session');
      expect(response.status(), `vérification n° ${index + 1}`).toBe(200);
    }
  });

  test('la PWA est installable (manifeste et service worker servis)', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).name).toContain('DashIA');
    const worker = await request.get('/sw.js');
    expect(worker.ok()).toBe(true);
  });
});

import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Parcours complet d'un nouvel utilisateur : crée un compte, donc jamais contre la prod.
test.skip(Boolean(process.env.E2E_READONLY), 'parcours avec écriture : pas en prod');

/** Le libellé englobe aussi le bouton « Afficher le mot de passe » et l'indication de longueur. */
const passwordInput = (page: Page) => page.locator('input[autocomplete$="-password"]');

const fileInList = (page: Page) => page.locator('strong', { hasText: 'facture-e2e.txt' });

test('inscription, dépôt d’un document, déconnexion puis reconnexion', async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'mot-de-passe-e2e-1234';

  await page.goto('/login');
  await page.getByRole('tab', { name: 'Inscription' }).click();
  await page.getByLabel('Nom').fill('Test E2E');
  await page.getByLabel('E-mail').fill(email);
  await passwordInput(page).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/bienvenue/);

  // Dépôt : vérifie au passage que le serveur peut écrire dans son stockage (bug de prod EACCES).
  await page.goto('/drive');
  // On attend la réponse du serveur : le nom du fichier s'affiche déjà pendant l'envoi, ce n'est pas une preuve.
  const uploaded = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/files');
  await page.locator('input[type="file"][multiple]').first().setInputFiles({
    name: 'facture-e2e.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Facture plombier : 340,50 EUR, échéance le 30 novembre.'),
  });
  expect((await uploaded).status()).toBeLessThan(300);
  await page.reload();
  await expect(fileInList(page)).toBeVisible();

  // Reconnexion par e-mail : la session est bien recréée.
  await page.context().clearCookies();
  await page.goto('/drive');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('E-mail').fill(email);
  await passwordInput(page).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/drive/);
  await expect(fileInList(page)).toBeVisible();
});

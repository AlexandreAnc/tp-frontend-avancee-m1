import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

/**
 * Crée un compte de test et ouvre sa session dans le contexte de la page (cookie partagé avec `page.request`).
 * Écrit en base : à n'utiliser que dans les tests sautés sous `E2E_READONLY`.
 */
export async function signUp(page: Page, baseURL: string): Promise<{ email: string; password: string }> {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'mot-de-passe-e2e-1234';
  // Better Auth limite les inscriptions à 3 par 10 s et par IP : on attend la fin de la fenêtre plutôt que d'échouer.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post('/api/auth/sign-up/email', {
      headers: { origin: new URL(baseURL).origin },
      data: { name: 'Test PWA', email, password },
    });
    if (response.ok()) return { email, password };
    if (response.status() !== 429) throw new Error(`Inscription refusée : ${response.status()} ${await response.text()}`);
    const retryAfter = Number(response.headers()['x-retry-after'] ?? 10);
    await page.waitForTimeout((retryAfter + 1) * 1000);
  }
  throw new Error('Inscription refusée : limite de débit toujours atteinte');
}

/** Dépose un petit fichier texte dans le drive du compte connecté, par l'API (comme le fait FileUploader). */
export async function uploadText(page: Page, baseURL: string, name: string, content: string): Promise<void> {
  const response = await page.request.post('/api/files', {
    headers: {
      origin: new URL(baseURL).origin,
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
    },
    data: Buffer.from(content),
  });
  if (!response.ok()) throw new Error(`Dépôt refusé : ${response.status()} ${await response.text()}`);
}

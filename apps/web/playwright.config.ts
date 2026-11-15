import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout dans un vrai navigateur.
 * - En CI : contre l'app compilée (`nuxt build`), démarrée ici avec une base PostgreSQL de service.
 * - Après un déploiement : `E2E_BASE_URL=https://… E2E_READONLY=1` ne lance que les vérifications sans écriture.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node .output/server/index.mjs',
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Les tests d'intégration partagent une base : pas d'exécution parallèle entre fichiers.
    fileParallelism: false,
  },
});

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
    coverage: {
      provider: 'v8',
      // La logique testable sans navigateur : services, utilitaires serveur et front, connecteurs.
      include: ['server/services/**/*.ts', 'server/utils/**/*.ts', 'server/connectors/**/*.ts', 'utils/**/*.ts'],
      reporter: ['text-summary', 'html'],
      // Cliquet : la CI échoue si la couverture baisse. On relève ces seuils quand on ajoute des tests.
      thresholds: { statements: 63, branches: 51, functions: 58, lines: 66 },
    },
  },
});

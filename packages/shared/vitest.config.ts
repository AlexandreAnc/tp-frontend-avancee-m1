import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Tout le code source compte, même un fichier qu'aucun test ne charge.
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'html'],
      // Cliquet : la CI échoue si la couverture baisse. On relève ces seuils quand on ajoute des tests.
      thresholds: { statements: 90, lines: 90 },
    },
  },
});

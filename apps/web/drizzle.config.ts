import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('.env');
} catch {
  // Pas de fichier .env : variables déjà présentes dans l'environnement (CI, Docker).
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app',
  },
  strict: true,
  verbose: true,
});

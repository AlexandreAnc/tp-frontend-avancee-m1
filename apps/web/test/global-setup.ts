import { readdir, rm } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { TEST_DATABASE_URL } from './env';

/** Supprime les dossiers de stockage créés par les tests (un par processus de test). */
async function cleanupStorage() {
  const entries = await readdir('./.data').catch(() => []);
  await Promise.all(entries.filter((name) => name.startsWith('test-files-'))
    .map((name) => rm(`./.data/${name}`, { recursive: true, force: true })));
}

/** Crée et migre la base de test. Si PostgreSQL est injoignable, les tests d'intégration sont ignorés. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  try {
    await admin.connect();
  } catch {
    process.env.SKIP_DB_TESTS = '1';
    console.warn(`[test] PostgreSQL injoignable (${url.host}) : tests d'intégration ignorés. Lancez \`docker compose up -d db\`.`);
    return;
  }
  const exists = await admin.query('select 1 from pg_database where datname = $1', [database]);
  if (exists.rowCount === 0) await admin.query(`create database "${database}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(drizzle({ client: pool }), { migrationsFolder: './server/db/migrations' });
  await pool.end();
  return cleanupStorage;
}

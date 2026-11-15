import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getEnv } from '../utils/env';
import * as schema from './schema';

// La pré-génération (`nuxt build`) importe le serveur sans les secrets de prod, et aucune page
// pré-générée ne lit la base : on ne valide l'environnement qu'à l'exécution.
export const pool = new pg.Pool({
  connectionString: import.meta.prerender ? undefined : getEnv().DATABASE_URL,
});

export const db = drizzle({ client: pool, schema});

export type Database = typeof db;
/** Base ou transaction en cours : les services acceptent les deux. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export { schema };

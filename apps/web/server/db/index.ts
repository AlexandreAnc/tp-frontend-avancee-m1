import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getEnv } from '../utils/env';
import * as schema from './schema';

export const pool = new pg.Pool({ connectionString: getEnv().DATABASE_URL });

export const db = drizzle({ client: pool, schema});

export type Database = typeof db;
/** Base ou transaction en cours : les services acceptent les deux. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export { schema };

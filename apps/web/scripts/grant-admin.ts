/**
 * Confirme l'adresse d'un compte listé dans ADMIN_EMAILS : sans cette confirmation, il n'a pas les droits d'admin.
 * L'inscription ne vérifie pas l'e-mail ; seul l'exploitant, qui a accès à la base, peut donc confirmer une adresse admin.
 * Usage : pnpm --filter web admin:grant <email>
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../server/db';
import { getEnv } from '../server/utils/env';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage : pnpm --filter web admin:grant <email>');
  process.exit(1);
}

try {
  if (!getEnv().ADMIN_EMAILS.includes(email)) {
    console.error('Cette adresse n’est pas dans ADMIN_EMAILS.');
    process.exitCode = 1;
  } else {
    const { rowCount } = await db.execute(sql`update "user" set email_verified = true where lower(email) = ${email}`);
    console.info(rowCount ? 'Adresse confirmée : le compte a les droits d’admin.' : 'Aucun compte avec cette adresse : inscrivez-vous d’abord.');
    if (!rowCount) process.exitCode = 1;
  }
} finally {
  await pool.end();
}

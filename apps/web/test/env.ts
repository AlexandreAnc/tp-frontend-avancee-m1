/** Base dédiée aux tests (créée et migrée par global-setup), jamais la base de dev. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/app_test';

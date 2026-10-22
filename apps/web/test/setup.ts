import { TEST_DATABASE_URL } from './env';

Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL,
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  STORAGE_DIR: `./.data/test-files-${process.pid}`,
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  VAPID_PUBLIC_KEY: 'test',
  VAPID_PRIVATE_KEY: 'test',
  VAPID_SUBJECT: 'mailto:test@example.com',
  EMBED_MODEL: 'bge-m3',
  HUE_CLIENT_ID: 'hue-client',
  HUE_CLIENT_SECRET: 'hue-secret',
});

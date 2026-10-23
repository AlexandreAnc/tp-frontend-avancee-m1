import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '../db';
import { getEnv } from './env';

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    // Dev : connexion par e-mail depuis un tunnel cloudflared (les passkeys restent liées à BETTER_AUTH_URL).
    trustedOrigins: process.env.NODE_ENV === 'production' ? [] : ['https://*.trycloudflare.com'],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
      },
    }),
    plugins: [
      passkey({
        rpID: new URL(env.BETTER_AUTH_URL).hostname,
        rpName: 'DashIA',
        origin: env.BETTER_AUTH_URL,
      }),
    ],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
    },
    // IP du visiteur pour la limite par IP : posée par Caddy en prod (une seule valeur), localhost en dev.
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  auth ??= createAuth();
  return auth;
}

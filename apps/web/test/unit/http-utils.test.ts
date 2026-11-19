import { createApp, createRouter, toWebHandler, type H3Event } from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../server/utils/errors';
import { defineAppHandler } from '../../server/utils/handler';
import { consumeOAuthState, createOAuthState } from '../../server/utils/oauth-state';
import { isAdmin, requireAdmin, requireUser } from '../../server/utils/session';
import { requireTaskToken } from '../../server/utils/task-auth';
import { getExternalAiProviderParam, getUuidParam, getValidatedQueryOrThrow, readValidatedBodyOrThrow } from '../../server/utils/validation';

const getSession = vi.fn();
vi.mock('../../server/utils/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
const verifyTaskToken = vi.fn(async (token: string, _allowed: readonly string[]) => ({ userId: 'u1', taskId: token, taskType: 'chat.reply', conversationId: null }));
vi.mock('../../server/services/task-tokens', () => ({ verifyTaskToken: (token: string, allowed: readonly string[]) => verifyTaskToken(token, allowed) }));

process.env.ADMIN_EMAILS = ' Admin@Example.com , autre@example.com';

/** Monte une route sur une app h3 et l'appelle comme le ferait Nitro, avec `defineAppHandler`. */
async function call(path: string, route: string, handler: (event: H3Event) => unknown, init: RequestInit = {}) {
  const router = createRouter();
  router.use(route, defineAppHandler(handler));
  const app = createApp().use(router);
  const response = await toWebHandler(app)(new Request(`http://localhost${path}`, init));
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null, headers: response.headers };
}

describe('defineAppHandler', () => {
  it('renvoie le résultat du service', async () => {
    expect(await call('/ok', '/ok', () => ({ ok: true }))).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("traduit une AppError en statut HTTP, avec son code et ses détails", async () => {
    const response = await call('/x', '/x', () => {
      throw new AppError('quota_exceeded', 'Plus de place', { usedBytes: 1 });
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ data: { code: 'quota_exceeded', details: { usedBytes: 1 } } });
    // Le message (en français) est celui que Nitro renvoie au navigateur.
    const handler = defineAppHandler(() => {
      throw new AppError('not_found', 'Fichier introuvable');
    });
    await expect(handler({} as H3Event)).rejects.toMatchObject({ statusCode: 404, message: 'Fichier introuvable' });
  });

  it("ne divulgue pas le message d'une erreur inattendue", async () => {
    const response = await call('/x', '/x', () => {
      throw new Error('mot de passe de la base: hunter2');
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });
});

describe('validation des entrées', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('valide le corps et renvoie une erreur 400 détaillée', async () => {
    const handler = (event: H3Event) => readValidatedBodyOrThrow(event, schema);
    const post = (body: unknown) => call('/body', '/body', handler, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
    expect((await post({ name: 'ok' })).body).toEqual({ name: 'ok' });
    const invalid = await post({ name: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ data: { code: 'validation', details: { fieldErrors: { name: expect.any(Array) } } } });
  });

  it('valide la query string', async () => {
    const handler = (event: H3Event) => getValidatedQueryOrThrow(event, z.object({ limit: z.coerce.number().int().max(100) }));
    expect((await call('/q?limit=5', '/q', handler)).body).toEqual({ limit: 5 });
    expect((await call('/q?limit=500', '/q', handler)).status).toBe(400);
  });

  it("n'accepte qu'un UUID comme identifiant de ressource", async () => {
    const handler = (event: H3Event) => ({ id: getUuidParam(event) });
    const id = '0b6f3f43-5d8d-4a4e-9f43-6a7a2d6f6b11';
    expect((await call(`/files/${id}`, '/files/:id', handler)).body).toEqual({ id });
    expect((await call("/files/1%20or%201=1", '/files/:id', handler)).status).toBe(400);
  });

  it("n'accepte qu'un fournisseur d'IA externe (jamais celui du service)", async () => {
    const handler = (event: H3Event) => ({ provider: getExternalAiProviderParam(event) });
    expect((await call('/keys/anthropic', '/keys/:provider', handler)).body).toEqual({ provider: 'anthropic' });
    expect((await call('/keys/dashia', '/keys/:provider', handler)).status).toBe(400);
  });
});

describe('session', () => {
  afterEach(() => getSession.mockReset());
  const sessionOf = (email: string, emailVerified = true) => ({ user: { id: 'u1', email, name: 'Alice', emailVerified }, session: { id: 's1' } });

  it('renvoie l’utilisateur connecté avec sa session', async () => {
    getSession.mockResolvedValue(sessionOf('alice@example.com'));
    expect((await call('/me', '/me', requireUser)).body).toEqual({ id: 'u1', email: 'alice@example.com', name: 'Alice', emailVerified: true, sessionId: 's1' });
  });

  it('refuse une requête sans session (401)', async () => {
    getSession.mockResolvedValue(null);
    const response = await call('/me', '/me', requireUser);
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ data: { code: 'unauthorized' } });
  });

  it('réserve les routes d’administration aux e-mails configurés, sans tenir compte de la casse', async () => {
    getSession.mockResolvedValue(sessionOf('ADMIN@example.com'));
    expect((await call('/admin', '/admin', requireAdmin)).status).toBe(200);
    getSession.mockResolvedValue(sessionOf('alice@example.com'));
    expect((await call('/admin', '/admin', requireAdmin)).status).toBe(403);
    expect(isAdmin({ email: 'autre@example.com', emailVerified: true })).toBe(true);
  });

  it('refuse l’administration à une adresse admin non confirmée (inscription par un tiers)', async () => {
    getSession.mockResolvedValue(sessionOf('admin@example.com', false));
    expect((await call('/admin', '/admin', requireAdmin)).status).toBe(403);
    expect(isAdmin({ email: 'admin@example.com', emailVerified: false })).toBe(false);
  });
});

describe('token de tâche', () => {
  it('lit le token Bearer et le vérifie', async () => {
    const response = await call('/agent', '/agent', requireTaskToken, { headers: { authorization: 'Bearer abc' } });
    expect(response.body).toMatchObject({ userId: 'u1', taskId: 'abc' });
    expect(verifyTaskToken).toHaveBeenLastCalledWith('abc', ['chat.reply']);
  });

  it('refuse un en-tête absent ou d’un autre type', async () => {
    verifyTaskToken.mockClear();
    expect((await call('/agent', '/agent', requireTaskToken)).status).toBe(401);
    expect((await call('/agent', '/agent', requireTaskToken, { headers: { authorization: 'Basic abc' } })).status).toBe(401);
    expect(verifyTaskToken).not.toHaveBeenCalled();
  });
});

describe('state OAuth', () => {
  it('pose un cookie httpOnly limité au connecteur, puis accepte le même state une seule fois', async () => {
    const created = await call('/start', '/start', (event) => ({ state: createOAuthState(event, 'google') }));
    const state = created.body!.state as string;
    const cookie = created.headers.get('set-cookie')!;
    expect(cookie).toContain(`google_oauth_state=${state}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toContain('Path=/api/connectors/google');

    const check = (received: string | undefined, sentCookie = `google_oauth_state=${state}`) =>
      call('/cb', '/cb', (event) => ({ ok: consumeOAuthState(event, 'google', received) }), { headers: { cookie: sentCookie } });

    const valid = await check(state);
    expect(valid.body).toMatchObject({ ok: true });
    expect(valid.headers.get('set-cookie')).toMatch(/google_oauth_state=;/);
    expect((await check('autre-state')).body).toMatchObject({ ok: false });
    expect((await check(undefined)).body).toMatchObject({ ok: false });
    expect((await check(state, 'hue_oauth_state=' + state)).body).toMatchObject({ ok: false });
  });
});

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { decrypt } from '../../server/utils/crypto';
import { fakeHueCloud, type HueCall } from '../fixtures/hue';
import { createUser, skipDb, textStream } from './helpers';

/** Faux client OAuth Google : aucun appel réseau, les tokens rafraîchis sont émis à la demande. */
class FakeGoogleClient {
  static instances: FakeGoogleClient[] = [];
  static tokens: Record<string, unknown> = {};
  static revokeError: Error | null = null;
  credentials: Record<string, unknown> = {};
  revoked: string[] = [];
  private listeners: ((tokens: Record<string, unknown>) => void)[] = [];
  constructor() {
    FakeGoogleClient.instances.push(this);
  }
  async getToken(code: string) {
    return { tokens: code === 'code-refuse' ? {} : FakeGoogleClient.tokens };
  }
  setCredentials(credentials: Record<string, unknown>) {
    this.credentials = credentials;
  }
  on(_event: 'tokens', listener: (tokens: Record<string, unknown>) => void) {
    this.listeners.push(listener);
  }
  emitTokens(tokens: Record<string, unknown>) {
    for (const listener of this.listeners) listener(tokens);
  }
  async revokeToken(token: string) {
    if (FakeGoogleClient.revokeError) throw FakeGoogleClient.revokeError;
    this.revoked.push(token);
  }
}
let googleConfigured = true;
vi.mock('../../server/connectors/google/oauth', () => ({
  isGoogleConfigured: () => googleConfigured,
  createOAuthClient: () => new FakeGoogleClient(),
}));
const calendar = { events: { insert: vi.fn(), list: vi.fn() } };
vi.mock('googleapis', () => ({ google: { calendar: () => calendar } }));
vi.mock('../../server/jobs/boss', () => ({ getBoss: async () => ({ send: async () => 'job' }) }));
vi.mock('../../server/services/tasks', () => ({ enqueueTask: vi.fn(async () => 'job'), cancelTasksFor: vi.fn() }));

const connectors = await import('../../server/services/connectors');
const hue = await import('../../server/services/hue');
const registry = await import('../../server/connectors/registry');
const { getAgenda } = await import('../../server/services/agenda');
const { uploadFile } = await import('../../server/services/files');
const { deleteFolder, ensureFolderPath } = await import('../../server/services/drive');

const connectorRow = async (userId: string, provider: 'google' | 'hue') =>
  (await db.select().from(schema.connectors).where(eq(schema.connectors.userId, userId))).find((row) => row.provider === provider);

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe.skipIf(skipDb)('connecteur Google Agenda', () => {
  beforeEach(() => {
    FakeGoogleClient.instances = [];
    FakeGoogleClient.revokeError = null;
    FakeGoogleClient.tokens = { access_token: 'access-1', refresh_token: 'refresh-1', expiry_date: Date.UTC(2026, 11, 1), scope: 'calendar.events' };
    googleConfigured = true;
  });

  it('enregistre les tokens chiffrés et les redonne au client OAuth de l’utilisateur', async () => {
    const userId = await createUser();
    await connectors.connectGoogle(userId, 'code-ok');

    const row = (await connectorRow(userId, 'google'))!;
    expect(row.accessTokenEnc).not.toContain('access-1');
    expect(decrypt(row.refreshTokenEnc!)).toBe('refresh-1');
    expect(row.expiresAt?.getTime()).toBe(Date.UTC(2026, 11, 1));
    expect(await connectors.hasConnector(userId, 'google')).toBe(true);

    const client = await connectors.getGoogleClient(userId) as unknown as FakeGoogleClient;
    expect(client.credentials).toEqual({ access_token: 'access-1', refresh_token: 'refresh-1', expiry_date: Date.UTC(2026, 11, 1) });
  });

  it("refuse un consentement sans token d'accès", async () => {
    const userId = await createUser();
    await expect(connectors.connectGoogle(userId, 'code-refuse')).rejects.toMatchObject({ code: 'upstream' });
    expect(await connectors.hasConnector(userId, 'google')).toBe(false);
  });

  it('garde le refresh token quand Google ne le renvoie pas, et réenregistre les tokens rafraîchis', async () => {
    const userId = await createUser();
    await connectors.connectGoogle(userId, 'code-ok');
    FakeGoogleClient.tokens = { access_token: 'access-2' };
    await connectors.connectGoogle(userId, 'code-ok');
    let row = (await connectorRow(userId, 'google'))!;
    expect([decrypt(row.accessTokenEnc), decrypt(row.refreshTokenEnc!), row.expiresAt]).toEqual(['access-2', 'refresh-1', null]);

    const client = await connectors.getGoogleClient(userId) as unknown as FakeGoogleClient;
    client.emitTokens({ access_token: 'access-3', expiry_date: Date.UTC(2026, 11, 2) });
    client.emitTokens({ refresh_token: 'sans-access-token' });
    await flush();
    row = (await connectorRow(userId, 'google'))!;
    expect([decrypt(row.accessTokenEnc), decrypt(row.refreshTokenEnc!)]).toEqual(['access-3', 'refresh-1']);
  });

  it('exige une connexion, propre à chaque utilisateur', async () => {
    const alice = await createUser();
    const bob = await createUser();
    await connectors.connectGoogle(alice, 'code-ok');
    expect(await connectors.hasConnector(bob, 'google')).toBe(false);
    await expect(connectors.getGoogleClient(bob)).rejects.toMatchObject({ code: 'connector_missing' });
    await expect(registry.assertActionExecutable(bob, 'google_calendar.create_event')).rejects.toMatchObject({ code: 'connector_missing', message: expect.stringContaining('Google Agenda') });
    await expect(registry.assertActionExecutable(alice, 'google_calendar.create_event')).resolves.toBeUndefined();
    await expect(registry.assertActionExecutable(bob, 'reminder.create')).resolves.toBeUndefined();
  });

  it('révoque le refresh token à la déconnexion, même si Google le refuse', async () => {
    const userId = await createUser();
    await connectors.connectGoogle(userId, 'code-ok');
    await connectors.disconnectGoogle(userId);
    expect(FakeGoogleClient.instances.at(-1)!.revoked).toEqual(['refresh-1']);
    expect(await connectors.hasConnector(userId, 'google')).toBe(false);

    await connectors.connectGoogle(userId, 'code-ok');
    FakeGoogleClient.revokeError = new Error('invalid_token');
    await expect(connectors.disconnectGoogle(userId)).resolves.toBeUndefined();
    expect(await connectors.hasConnector(userId, 'google')).toBe(false);

    // Rien à révoquer sans connexion.
    const before = FakeGoogleClient.instances.length;
    await connectors.disconnectGoogle(userId);
    expect(FakeGoogleClient.instances).toHaveLength(before);
  });

  it('liste les connecteurs disponibles et branchés', async () => {
    const userId = await createUser();
    await connectors.connectGoogle(userId, 'code-ok');
    googleConfigured = false;
    expect(await connectors.listConnectors(userId)).toEqual([
      { provider: 'google', label: 'Google Agenda', available: false, connected: true, connectedAt: expect.any(String) },
      { provider: 'hue', label: 'Philips Hue', available: true, connected: false, connectedAt: null },
    ]);
  });

  it("crée l'événement validé dans l'agenda de l'utilisateur", async () => {
    const userId = await createUser();
    await connectors.connectGoogle(userId, 'code-ok');
    calendar.events.insert.mockResolvedValue({ data: { id: 'evt-1', htmlLink: null } });
    const result = await registry.executeAction(userId, {
      type: 'google_calendar.create_event',
      payload: { title: 'Plombier', start: '2026-11-20T09:00:00+01:00', end: '2026-11-20T10:00:00+01:00' },
    });
    expect(result).toEqual({ eventId: 'evt-1', htmlLink: null });
    expect(registry.canUndo('google_calendar.create_event')).toBe(false);
    await expect(registry.undoAction(userId, 'google_calendar.create_event', result)).rejects.toMatchObject({ code: 'conflict' });
  });

  it("affiche les événements Google dans le planning, et reste utilisable si Google est en panne", async () => {
    const userId = await createUser();
    const from = new Date('2026-11-20T00:00:00Z');
    const to = new Date('2026-11-21T00:00:00Z');
    expect((await getAgenda(userId, from, to)).calendarConnected).toBe(false);

    await connectors.connectGoogle(userId, 'code-ok');
    calendar.events.list.mockResolvedValueOnce({ data: { items: [{ id: 'a', summary: 'Réunion', start: { dateTime: '2026-11-20T09:00:00Z' } }] } });
    expect(await getAgenda(userId, from, to)).toEqual({
      calendarConnected: true,
      items: [{ kind: 'event', id: 'a', title: 'Réunion', start: '2026-11-20T09:00:00Z', end: null, allDay: false, location: null, link: null }],
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    calendar.events.list.mockRejectedValueOnce(new Error('quota'));
    expect(await getAgenda(userId, from, to)).toEqual({ calendarConnected: true, items: [] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe.skipIf(skipDb)('connecteur Philips Hue', () => {
  let calls: HueCall[];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(fakeHueCloud(calls)));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function connectedUser() {
    const userId = await createUser();
    await hue.connectHue(userId, 'code-hue');
    calls.length = 0;
    return userId;
  }

  it("termine l'OAuth, appaire le pont et garde la clé d'application chiffrée", async () => {
    const userId = await createUser();
    expect(await hue.getHome(userId)).toEqual({ connected: false, rooms: [], scenes: [] });
    await hue.connectHue(userId, 'code-hue');

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /v2/oauth2/token', 'PUT /route/api/0/config', 'POST /route/api']);
    expect(calls[0]!.body).toEqual({ grant_type: 'authorization_code', code: 'code-hue' });
    const row = (await connectorRow(userId, 'hue'))!;
    expect(decrypt(row.accessTokenEnc)).toBe('hue-access');
    expect(decrypt(row.metadata!.applicationKeyEnc!)).toBe('cle-pont');
    expect(JSON.stringify(row)).not.toContain('cle-pont');
  });

  it('lit la maison avec la clé du pont', async () => {
    const userId = await connectedUser();
    const home = await hue.getHome(userId);
    expect(home).toMatchObject({ connected: true, rooms: [expect.objectContaining({ name: 'Salon' }), expect.objectContaining({ name: 'Rez-de-chaussée' })] });
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('exécute une action Hue puis la rétablit depuis le journal', async () => {
    const userId = await connectedUser();
    const result = await registry.executeAction(userId, { type: 'hue.set_room', payload: { roomId: 'gl-salon', on: false } });
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([{ method: 'PUT', path: '/route/clip/v2/resource/grouped_light/gl-salon', body: { on: { on: false } } }]);

    calls.length = 0;
    expect(registry.canUndo('hue.set_room')).toBe(true);
    await registry.undoAction(userId, 'hue.set_room', result);
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([
      { method: 'PUT', path: '/route/clip/v2/resource/grouped_light/gl-salon', body: { on: { on: true }, dimming: { brightness: 70 } } },
    ]);
  });

  it('réenregistre un token rafraîchi', async () => {
    const userId = await connectedUser();
    await db.update(schema.connectors).set({ expiresAt: new Date(Date.now() + 1000) }).where(eq(schema.connectors.userId, userId));
    await (await hue.getHueApi(userId)).recallScene('scene-lecture');
    expect(calls[0]!.body).toEqual({ grant_type: 'refresh_token', refresh_token: 'hue-refresh' });
    expect((await connectorRow(userId, 'hue'))!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("sans connexion, l'action Hue est refusée avec un message clair", async () => {
    const userId = await createUser();
    await expect(registry.assertActionExecutable(userId, 'hue.set_light')).rejects.toMatchObject({ code: 'connector_missing' });
    await expect(hue.getHueApi(userId)).rejects.toMatchObject({ code: 'connector_missing' });
  });

  it("changer d'application Philips déconnecte le pont : la connexion est à refaire avec elle", async () => {
    const userId = await connectedUser();
    await hue.saveHueApp(userId, 'mon-client', 'mon-secret');
    expect(await connectors.hasConnector(userId, 'hue')).toBe(false);
    await hue.connectHue(userId, 'code-hue');
    expect(calls[0]!.path).toBe('/v2/oauth2/token');
    await hue.disconnectHue(userId);
    expect(await hue.getHome(userId)).toMatchObject({ connected: false });
  });

  it('isole les connexions Hue entre utilisateurs', async () => {
    const alice = await connectedUser();
    const bob = await createUser();
    expect(await connectors.hasConnector(alice, 'hue')).toBe(true);
    expect(await hue.getHome(bob)).toEqual({ connected: false, rooms: [], scenes: [] });
    await hue.disconnectHue(bob);
    expect(await connectors.hasConnector(alice, 'hue')).toBe(true);
  });
});

describe.skipIf(skipDb)('annulation du rangement d’un fichier', () => {
  it("remet le fichier à la racine si son dossier d'origine a été supprimé", async () => {
    const userId = await createUser();
    const origin = await ensureFolderPath(userId, 'Brouillons');
    const file = await uploadFile(userId, { fileName: 'note.txt', stream: textStream('x'), folderId: origin });
    const result = await registry.executeAction(userId, { type: 'drive.move_file', payload: { fileId: file.id, folderPath: 'Impôts' } });
    await deleteFolder(userId, origin!, 'keep');

    await registry.undoAction(userId, 'drive.move_file', result);
    const [row] = await db.select().from(schema.files).where(eq(schema.files.id, file.id));
    expect(row!.folderId).toBeNull();
  });

  it("ne masque pas une autre erreur (fichier d'un autre utilisateur)", async () => {
    const userId = await createUser();
    await expect(registry.undoAction(userId, 'drive.move_file', { fileId: randomUUID(), previousFolderId: null })).rejects.toMatchObject({ code: 'not_found' });
  });
});

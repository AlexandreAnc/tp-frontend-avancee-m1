import { PROTOCOL_VERSION, type AgentStats } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../src/config';
import { ServerConnection, toWebSocketUrl, type ConnectionHandlers } from '../src/connection/client';

const sampleStats = vi.hoisted(() => vi.fn<() => Promise<AgentStats>>());
vi.mock('../src/connection/stats', () => ({ createStatsSampler: () => sampleStats }));

/** WebSocket simulé : le test ouvre, ferme et fait parler le serveur. */
class FakeSocket extends EventTarget {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  readonly sent: Record<string, unknown>[] = [];
  closedWith: [number, string] | null = null;

  constructor(readonly url: string) {
    super();
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code: number, reason: string) {
    this.closedWith = [code, reason];
    this.readyState = 3;
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  receive(message: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: typeof message === 'string' ? message : JSON.stringify(message) }));
  }

  drop(code = 1006, reason = '') {
    this.readyState = 3;
    this.dispatchEvent(new Event('error'));
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
  }

  ofType(type: string) {
    return this.sent.filter((message) => message.type === type);
  }
}

const config = {
  SERVER_URL: 'https://dashia.test',
  AGENT_KEY: 'agk_secret',
  AGENT_NAME: 'mac-mini',
  CHAT_MODEL: 'qwen3:8b',
  EMBED_MODEL: 'bge-m3',
  AGENT_CONCURRENCY: 2,
} as AgentConfig;
const models = [{ name: 'qwen3:8b', capabilities: ['tools'] }];
const welcome = { type: 'welcome', agentId: 'a1', protocolVersion: PROTOCOL_VERSION, heartbeatIntervalMs: 10_000 };

function setup(overrides: Partial<ConnectionHandlers> = {}) {
  const handlers = {
    onMessage: vi.fn(),
    listModels: vi.fn(async () => models),
    onDisconnect: vi.fn(),
    onFatalError: vi.fn(),
    ...overrides,
  } satisfies ConnectionHandlers;
  const connection = new ServerConnection(config, handlers);
  connection.start();
  const socket = () => FakeSocket.instances.at(-1)!;
  return { connection, handlers, socket };
}

/** Laisse les promesses en attente (liste des modèles, statistiques) se résoudre. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {});
  sampleStats.mockReset().mockResolvedValue({ cpu: 12, ram: 40, vram: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toWebSocketUrl', () => {
  it('passe en wss derrière HTTPS et en ws sinon', () => {
    expect(toWebSocketUrl('https://dashia.test')).toBe('wss://dashia.test/_agent');
    expect(toWebSocketUrl('http://localhost:3000/ignored')).toBe('ws://localhost:3000/_agent');
  });
});

describe('ServerConnection', () => {
  it('se présente avec sa clé, ses modèles et la version du protocole', async () => {
    const { socket } = setup();
    expect(socket().url).toBe('wss://dashia.test/_agent');
    socket().open();
    await flush();
    expect(socket().sent).toEqual([{
      type: 'hello', protocolVersion: PROTOCOL_VERSION, agentKey: 'agk_secret', name: 'mac-mini',
      chatModel: 'qwen3:8b', embedModel: 'bge-m3', concurrency: 2, models,
    }]);
  });

  it('se présente quand même si Ollama ne répond pas (liste de modèles vide)', async () => {
    const { socket } = setup({ listModels: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) });
    socket().open();
    await flush();
    expect(socket().ofType('hello')).toEqual([expect.objectContaining({ models: [] })]);
  });

  it('n’envoie pas un hello en retard sur la connexion suivante', async () => {
    let releaseFirst!: (value: typeof models) => void;
    const listModels = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { releaseFirst = resolve; }))
      .mockResolvedValue(models);
    const { socket } = setup({ listModels });
    const first = socket();
    first.open();
    first.drop();
    await vi.advanceTimersByTimeAsync(1_000);
    const second = socket();
    expect(second).not.toBe(first);
    second.open();
    releaseFirst(models);
    await flush();
    expect(second.ofType('hello')).toHaveLength(1);
    expect(first.sent).toEqual([]);
  });

  it('envoie un heartbeat avec la charge de la machine après le welcome', async () => {
    const { socket } = setup();
    socket().open();
    socket().receive(welcome);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket().ofType('heartbeat')).toEqual([{ type: 'heartbeat', stats: { cpu: 12, ram: 40, vram: null } }]);

    sampleStats.mockRejectedValueOnce(new Error('os'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket().ofType('heartbeat').at(-1)).toEqual({ type: 'heartbeat' });
  });

  it('n’envoie de brouillons qu’à un serveur qui les annonce, et oublie l’annonce à la déconnexion', () => {
    const { connection, socket } = setup();
    socket().open();
    socket().receive(welcome);
    expect(connection.acceptsDrafts).toBe(false);
    socket().receive({ ...welcome, drafts: true });
    expect(connection.acceptsDrafts).toBe(true);
    socket().drop();
    expect(connection.acceptsDrafts).toBe(false);
  });

  it('répond au ping avec le même nonce', async () => {
    const { socket } = setup();
    socket().open();
    socket().receive({ type: 'ping', nonce: 'n-42' });
    expect(socket().ofType('pong')).toEqual([{ type: 'pong', nonce: 'n-42' }]);
  });

  it('transmet les tâches et changements de modèle, ignore un message invalide', () => {
    const onMessage = vi.fn<ConnectionHandlers['onMessage']>();
    const { socket } = setup({ onMessage });
    socket().open();
    socket().receive('pas du json');
    socket().receive({ type: 'task.assign', taskId: 't1' });
    expect(onMessage).not.toHaveBeenCalled();

    const assign = { type: 'task.assign', taskId: 't1', taskType: 'chat.reply', token: 'tok', payload: {} };
    socket().receive(assign);
    socket().receive({ type: 'task.cancel', taskId: 't1' });
    socket().receive({ type: 'config.update', chatModel: 'gemma3' });
    expect(onMessage.mock.calls.map(([message]) => message.type)).toEqual(['task.assign', 'task.cancel', 'config.update']);
  });

  it('s’arrête sans se reconnecter sur une erreur fatale (clé révoquée)', async () => {
    const { socket, handlers } = setup();
    socket().open();
    socket().receive({ type: 'error', code: 'revoked', message: 'Clé révoquée' });
    expect(handlers.onFatalError).toHaveBeenCalledWith('Clé révoquée');
    expect(socket().closedWith).toEqual([1000, 'agent_stop']);
    socket().drop(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('reste connecté sur une erreur non fatale', () => {
    const { socket, handlers } = setup();
    socket().open();
    socket().receive({ type: 'error', code: 'invalid_message', message: 'Message invalide' });
    expect(handlers.onFatalError).not.toHaveBeenCalled();
    expect(socket().closedWith).toBeNull();
  });

  it('abandonne les tâches et se reconnecte avec un délai croissant, plafonné', async () => {
    const { socket, handlers } = setup();
    const delays: number[] = [];
    for (let attempt = 0; attempt < 7; attempt++) {
      const count = FakeSocket.instances.length;
      socket().drop();
      let waited = 0;
      while (FakeSocket.instances.length === count) {
        await vi.advanceTimersByTimeAsync(1_000);
        waited += 1_000;
      }
      delays.push(waited);
    }
    expect(handlers.onDisconnect).toHaveBeenCalledTimes(7);
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it('repart du délai initial après une connexion réussie, et coupe le heartbeat à la déconnexion', async () => {
    const { socket } = setup();
    socket().drop();
    await vi.advanceTimersByTimeAsync(1_000);
    socket().drop();
    await vi.advanceTimersByTimeAsync(2_000);
    const connected = socket();
    connected.open();
    connected.receive(welcome);
    connected.drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(connected.ofType('heartbeat')).toEqual([]);
  });

  it('stop ferme la connexion sans reconnexion ni envoi', async () => {
    const { connection, socket, handlers } = setup();
    socket().open();
    connection.stop();
    expect(socket().closedWith).toEqual([1000, 'agent_stop']);
    connection.send({ type: 'pong', nonce: 'x' });
    socket().drop(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(handlers.onDisconnect).not.toHaveBeenCalled();
    expect(socket().ofType('pong')).toEqual([]);
  });
});

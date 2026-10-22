import {
  AGENT_WS_PATH,
  FATAL_PROTOCOL_ERRORS,
  PROTOCOL_VERSION,
  serverToAgentMessageSchema,
  type AgentToServerMessage,
  type ServerToAgentMessage,
} from '@app/shared';
import type { AgentConfig } from '../config';
import { createStatsSampler } from './stats';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface ConnectionHandlers {
  onMessage: (message: Exclude<ServerToAgentMessage, { type: 'welcome' | 'error' | 'ping' }>) => void;
  /** Modèles installés, annoncés au serveur à chaque connexion. */
  listModels: () => Promise<{ name: string; capabilities: string[] }[]>;
  /** Appelé à chaque perte de connexion : les tâches en cours doivent être abandonnées. */
  onDisconnect: () => void;
  onFatalError: (message: string) => void;
}

export function toWebSocketUrl(serverUrl: string): string {
  const url = new URL(AGENT_WS_PATH, serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/**
 * Connexion sortante vers la prod (aucun port à ouvrir sur la machine).
 * S'authentifie avec la clé de l'agent dans `hello`, envoie un heartbeat régulier
 * et se reconnecte avec un délai croissant en cas de coupure.
 */
export class ServerConnection {
  private socket: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | undefined;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  private readonly sampleStats = createStatsSampler();

  constructor(
    private readonly config: AgentConfig,
    private readonly handlers: ConnectionHandlers,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.cleanup();
    this.socket?.close(1000, 'agent_stop');
    this.socket = null;
  }

  send(message: AgentToServerMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private connect(): void {
    const url = toWebSocketUrl(this.config.SERVER_URL);
    console.info(`[agent] connexion à ${url}…`);
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      void this.handlers.listModels().catch(() => []).then((models) => this.send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        agentKey: this.config.AGENT_KEY,
        name: this.config.AGENT_NAME,
        chatModel: this.config.CHAT_MODEL,
        embedModel: this.config.EMBED_MODEL,
        concurrency: this.config.AGENT_CONCURRENCY,
        models,
      }));
    });

    socket.addEventListener('message', (event) => {
      this.onRawMessage(typeof event.data === 'string' ? event.data : String(event.data));
    });

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.cleanup();
      this.handlers.onDisconnect();
      if (this.stopped) return;
      console.warn(`[agent] connexion fermée (${event.code}${event.reason ? ` ${event.reason}` : ''}), nouvelle tentative dans ${this.reconnectDelay / 1000} s`);
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    });

    socket.addEventListener('error', () => {
      // L'événement `close` suit toujours : la reconnexion est gérée là.
    });
  }

  private onRawMessage(raw: string): void {
    let message: ServerToAgentMessage;
    try {
      message = serverToAgentMessageSchema.parse(JSON.parse(raw));
    } catch {
      console.warn('[agent] message du serveur ignoré (format inconnu)');
      return;
    }

    switch (message.type) {
      case 'welcome':
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this.startHeartbeat(message.heartbeatIntervalMs);
        console.info(`[agent] connecté en tant que ${this.config.AGENT_NAME} (protocole v${message.protocolVersion})`);
        return;
      case 'error':
        console.error(`[agent] refusé par le serveur : ${message.message}`);
        if (FATAL_PROTOCOL_ERRORS.includes(message.code)) {
          this.stop();
          this.handlers.onFatalError(message.message);
        }
        return;
      case 'ping':
        this.send({ type: 'pong', nonce: message.nonce });
        return;
      default:
        this.handlers.onMessage(message);
    }
  }

  private startHeartbeat(intervalMs: number): void {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      this.sampleStats()
        .then((stats) => this.send({ type: 'heartbeat', stats }))
        .catch(() => this.send({ type: 'heartbeat' }));
    }, intervalMs);
  }

  private cleanup(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
}

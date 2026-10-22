import type { AgentStats, TaskPayload, TaskType } from '@app/shared';

/** Socket minimale utilisée par la passerelle (implémentée par un peer crossws). */
export interface AgentSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface InFlightTask {
  taskId: string;
  type: TaskType;
  /** Tentative pg-boss en cours : seule cette tentative peut être complétée ou échouée. */
  attempt: { id: string; retryCount: number };
  final: boolean;
  userId: string;
  payload: TaskPayload<TaskType>;
  stepCount: number;
}

export interface ConnectedAgent {
  connectionId: string;
  agentKeyId: string;
  name: string;
  chatModel: string;
  embedModel: string;
  concurrency: number;
  socket: AgentSocket;
  connectedAt: number;
  lastHeartbeatAt: number;
  lastPersistedAt: number;
  stats: AgentStats | null;
  models: { name: string; capabilities: string[] }[];
  tasks: Map<string, InFlightTask>;
}

/** Agents connectés à cette instance (identifiés par connexion WebSocket). */
export const agents = new Map<string, ConnectedAgent>();

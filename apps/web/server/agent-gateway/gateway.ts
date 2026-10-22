import { randomUUID } from 'node:crypto';
import {
  agentToServerMessageSchema,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HELLO_TIMEOUT_MS,
  PROTOCOL_VERSION,
  taskPayloadSchemas,
  taskResultSchemas,
  type AgentStep,
  type AgentToServerMessage,
  type HelloMessage,
  type ProtocolErrorCode,
  type ServerToAgentMessage,
  type TaskType,
} from '@app/shared';
import type { JobWithMetadata } from 'pg-boss';
import { getBoss } from '../jobs/boss';
import { TASK_DISPATCH_ORDER, type TaskJobData } from '../jobs/queues';
import { isAgentKeyActive, setAgentKeyChatModel, touchAgentKey, verifyAgentKey } from '../services/agent-keys';
import { publishToAll } from '../services/events';
import { taskEvents, type TaskSubject } from '../services/tasks';
import { issueTaskToken, revokeTaskTokens } from '../services/task-tokens';
import { getEnv } from '../utils/env';
import { AppError } from '../utils/errors';
import { agents, type AgentSocket, type ConnectedAgent, type InFlightTask } from './registry';
import { taskHandlers, type TaskHandler } from './task-handlers';

/** Codes de fermeture WebSocket applicatifs (plage 4000-4999). */
const CLOSE_CODES: Record<ProtocolErrorCode, number> = {
  invalid_message: 4000,
  incompatible_protocol: 4001,
  unauthorized: 4003,
  hello_timeout: 4008,
  heartbeat_timeout: 4009,
  replaced: 4010,
  revoked: 4011,
};

/** Fréquence de vérification de la révocation des clés et d'écriture de `last_seen_at`. */
const PERSIST_INTERVAL_MS = 60_000;
const MONITOR_INTERVAL_MS = 5_000;

const handlerFor = (type: TaskType) => taskHandlers[type] as TaskHandler<TaskType>;

function send(socket: AgentSocket, message: ServerToAgentMessage): void {
  socket.send(JSON.stringify(message));
}

function rejectConnection(socket: AgentSocket, code: ProtocolErrorCode, message: string): void {
  send(socket, { type: 'error', code, message });
  socket.close(CLOSE_CODES[code], code);
}

// ── Connexions en attente de `hello` ────────────────────────────

const awaitingHello = new Map<string, { socket: AgentSocket; timer: NodeJS.Timeout }>();

export function handleOpen(connectionId: string, socket: AgentSocket): void {
  const timer = setTimeout(() => {
    awaitingHello.delete(connectionId);
    rejectConnection(socket, 'hello_timeout', 'Message hello attendu');
  }, HELLO_TIMEOUT_MS);
  awaitingHello.set(connectionId, { socket, timer });
}

export async function handleMessage(connectionId: string, raw: string): Promise<void> {
  let message: AgentToServerMessage;
  try {
    message = agentToServerMessageSchema.parse(JSON.parse(raw));
  } catch {
    const socket = awaitingHello.get(connectionId)?.socket ?? agents.get(connectionId)?.socket;
    if (socket) rejectConnection(socket, 'invalid_message', 'Message invalide');
    return;
  }

  const waiting = awaitingHello.get(connectionId);
  if (waiting) {
    clearTimeout(waiting.timer);
    awaitingHello.delete(connectionId);
    if (message.type !== 'hello') {
      rejectConnection(waiting.socket, 'invalid_message', 'Le premier message doit être hello');
      return;
    }
    await registerAgent(connectionId, waiting.socket, message);
    return;
  }

  const agent = agents.get(connectionId);
  if (!agent) return;

  switch (message.type) {
    case 'hello':
      return;
    case 'heartbeat':
      agent.stats = message.stats ?? agent.stats;
      await onHeartbeat(agent);
      return;
    case 'task.step':
      await onStep(agent, message.taskId, message.step);
      return;
    case 'task.completed':
      await onCompleted(agent, message.taskId, message.result);
      return;
    case 'task.failed':
      await onFailed(agent, message.taskId, message.error, message.retryable);
      return;
    case 'pong':
      pendingPings.get(message.nonce)?.(Date.now());
      return;
    case 'config.applied':
      if (message.error) {
        console.warn(`[agent-gateway] ${agent.name} n'a pas pu passer sur ${message.chatModel} : ${message.error}`);
      } else {
        agent.chatModel = message.chatModel;
        publishToAll({ type: 'agent.status', ...getAgentStatus() });
      }
  }
}

export async function handleClose(connectionId: string): Promise<void> {
  const waiting = awaitingHello.get(connectionId);
  if (waiting) {
    clearTimeout(waiting.timer);
    awaitingHello.delete(connectionId);
  }
  const agent = agents.get(connectionId);
  if (agent) await dropAgent(agent, 'déconnexion');
}

// ── Cycle de vie d'un agent ─────────────────────────────────────

function hasEligibleAgent(): boolean {
  const embedModel = getEnv().EMBED_MODEL;
  return [...agents.values()].some((agent) => agent.embedModel === embedModel);
}

let lastPublishedOnline: boolean | null = null;

function publishAgentStatus(): void {
  const online = hasEligibleAgent();
  if (online !== lastPublishedOnline) {
    lastPublishedOnline = online;
    publishToAll({ type: 'agent.status', ...getAgentStatus() });
  }
}

async function registerAgent(connectionId: string, socket: AgentSocket, hello: HelloMessage): Promise<void> {
  if (hello.protocolVersion !== PROTOCOL_VERSION) {
    rejectConnection(socket, 'incompatible_protocol', `Protocole ${hello.protocolVersion} incompatible : le serveur attend la version ${PROTOCOL_VERSION}`);
    return;
  }
  const key = await verifyAgentKey(hello.agentKey);
  if (!key) {
    rejectConnection(socket, 'unauthorized', "Clé d'agent invalide ou révoquée");
    return;
  }

  // Une clé = une machine : une nouvelle connexion avec la même clé remplace l'ancienne.
  for (const existing of agents.values()) {
    if (existing.agentKeyId === key.id) {
      rejectConnection(existing.socket, 'replaced', `La clé de ${existing.name} est utilisée par une nouvelle connexion (${hello.name}) : une clé par machine`);
      await dropAgent(existing, 'remplacé par une nouvelle connexion');
    }
  }

  const now = Date.now();
  agents.set(connectionId, {
    connectionId,
    agentKeyId: key.id,
    name: hello.name,
    chatModel: hello.chatModel,
    embedModel: hello.embedModel,
    concurrency: hello.concurrency,
    socket,
    connectedAt: now,
    lastHeartbeatAt: now,
    lastPersistedAt: now,
    stats: null,
    models: hello.models ?? [],
    tasks: new Map(),
  });
  await touchAgentKey(key.id);
  send(socket, { type: 'welcome', agentId: key.id, protocolVersion: PROTOCOL_VERSION, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS });

  // Modèle choisi depuis l'app pour cette machine : réappliqué à chaque connexion.
  if (key.chatModel && key.chatModel !== hello.chatModel && (hello.models ?? []).some((model) => model.name === key.chatModel)) {
    send(socket, { type: 'config.update', chatModel: key.chatModel });
  }

  if (hello.embedModel !== getEnv().EMBED_MODEL) {
    console.warn(`[agent-gateway] ${hello.name} annonce ${hello.embedModel} au lieu de ${getEnv().EMBED_MODEL} : aucune tâche ne lui sera confiée`);
  }
  console.info(`[agent-gateway] ${hello.name} connecté (chat : ${hello.chatModel}, embeddings : ${hello.embedModel})`);
  publishAgentStatus();
  void dispatch();
}

async function onHeartbeat(agent: ConnectedAgent): Promise<void> {
  const now = Date.now();
  agent.lastHeartbeatAt = now;

  // Relaie le heartbeat à pg-boss : sans lui, les jobs actifs sont remis en file (ex. serveur redémarré).
  const boss = await getBoss();
  for (const task of agent.tasks.values()) {
    await boss.touch(task.type, task.attempt);
  }

  if (now - agent.lastPersistedAt >= PERSIST_INTERVAL_MS) {
    agent.lastPersistedAt = now;
    if (!await isAgentKeyActive(agent.agentKeyId)) {
      rejectConnection(agent.socket, 'revoked', "La clé de cet agent a été révoquée");
      await dropAgent(agent, 'clé révoquée');
      return;
    }
    await touchAgentKey(agent.agentKeyId);
  }
}

/** Retire un agent et remet ses tâches en file pour qu'une autre machine les reprenne. */
async function dropAgent(agent: ConnectedAgent, reason: string): Promise<void> {
  if (agents.get(agent.connectionId) !== agent) return;
  agents.delete(agent.connectionId);
  console.info(`[agent-gateway] ${agent.name} retiré (${reason}), ${agent.tasks.size} tâche(s) remise(s) en file`);

  const tasks = [...agent.tasks.values()];
  agent.tasks.clear();
  for (const task of tasks) {
    await failTask(task, `Agent ${agent.name} indisponible (${reason})`, true);
  }
  publishAgentStatus();
  void dispatch();
}

// ── Messages de tâche ───────────────────────────────────────────

async function onStep(agent: ConnectedAgent, taskId: string, step: AgentStep): Promise<void> {
  const task = agent.tasks.get(taskId);
  if (!task) return;
  const position = task.stepCount++;
  await handlerFor(task.type).onStep(task.userId, task.payload, position, step);
}

async function onCompleted(agent: ConnectedAgent, taskId: string, rawResult: unknown): Promise<void> {
  const task = agent.tasks.get(taskId);
  if (!task) return;

  const result = taskResultSchemas[task.type].safeParse(rawResult);
  if (!result.success) {
    await onFailed(agent, taskId, "Résultat de tâche invalide renvoyé par l'agent", true);
    return;
  }

  agent.tasks.delete(taskId);
  try {
    await handlerFor(task.type).onComplete(task.userId, task.payload, result.data);
    await (await getBoss()).complete(task.type, task.attempt, { agent: agent.name });
  } catch (error) {
    console.error(`[agent-gateway] finalisation de ${task.type} ${taskId}`, error);
    await failTask(task, 'Erreur serveur à la finalisation de la tâche', true);
  } finally {
    await revokeTaskTokens(taskId);
    void dispatch();
  }
}

async function onFailed(agent: ConnectedAgent, taskId: string, error: string, retryable: boolean): Promise<void> {
  const task = agent.tasks.get(taskId);
  if (!task) return;
  agent.tasks.delete(taskId);
  console.warn(`[agent-gateway] ${task.type} ${taskId} échouée sur ${agent.name} : ${error}`);
  await failTask(task, error, retryable);
  void dispatch();
}

/** Échoue la tentative en cours. Non réessayable : la tâche est close sans nouvelle tentative. */
async function failTask(task: InFlightTask, error: string, retryable: boolean): Promise<void> {
  const boss = await getBoss();
  const final = task.final || !retryable;
  try {
    if (retryable) {
      await boss.fail(task.type, task.attempt, { error });
    } else {
      await boss.complete(task.type, task.attempt, { error, retryable: false });
    }
    await handlerFor(task.type).onFail(task.userId, task.payload, error, final);
  } catch (failure) {
    console.error(`[agent-gateway] échec de ${task.type} ${task.taskId}`, failure);
  } finally {
    await revokeTaskTokens(task.taskId);
  }
}

// ── Attribution des tâches ──────────────────────────────────────

let dispatching = false;
let dispatchRequested = false;

/** Attribue les tâches en attente aux agents compatibles qui ont de la place. Jamais exécuté en parallèle. */
export async function dispatch(): Promise<void> {
  if (dispatching) {
    dispatchRequested = true;
    return;
  }
  dispatching = true;
  try {
    do {
      dispatchRequested = false;
      await dispatchOnce();
    } while (dispatchRequested);
  } catch (error) {
    console.error('[agent-gateway] attribution des tâches', error);
  } finally {
    dispatching = false;
  }
}

async function dispatchOnce(): Promise<void> {
  const embedModel = getEnv().EMBED_MODEL;
  const eligible = [...agents.values()].filter((agent) => agent.embedModel === embedModel);
  if (eligible.length === 0) return;
  const boss = await getBoss();

  // Les agents les moins chargés d'abord, pour répartir les tâches entre machines.
  eligible.sort((a, b) => a.tasks.size / a.concurrency - b.tasks.size / b.concurrency);

  for (const agent of eligible) {
    for (const type of TASK_DISPATCH_ORDER) {
      while (agents.has(agent.connectionId) && agent.tasks.size < agent.concurrency) {
        const [job] = await boss.fetch<TaskJobData>(type, { batchSize: 1, includeMetadata: true });
        if (!job) break;
        await assign(agent, type, job);
      }
    }
  }
}

async function assign(agent: ConnectedAgent, type: TaskType, job: JobWithMetadata<TaskJobData>): Promise<void> {
  const boss = await getBoss();
  const attempt = { id: job.id, retryCount: job.retryCount };
  const payload = taskPayloadSchemas[type].safeParse(job.data.payload);
  if (!payload.success) {
    await boss.complete(type, attempt, { error: 'Payload invalide' });
    return;
  }

  const task: InFlightTask = {
    taskId: job.id,
    type,
    attempt,
    final: job.retryCount >= job.retryLimit,
    userId: job.data.userId,
    payload: payload.data,
    stepCount: 0,
  };
  // Enregistrée avant tout `await` : une déconnexion pendant l'attribution remet la tâche en file.
  agent.tasks.set(task.taskId, task);

  try {
    const prepared = await handlerFor(type).prepare(task.userId, task.payload);
    if (!prepared) {
      agent.tasks.delete(task.taskId);
      await boss.complete(type, attempt, { skipped: 'objet supprimé' });
      return;
    }
    const token = await issueTaskToken({ userId: task.userId, taskId: task.taskId, conversationId: prepared.conversationId });
    if (!agent.tasks.has(task.taskId)) {
      await revokeTaskTokens(task.taskId);
      return;
    }
    send(agent.socket, { type: 'task.assign', taskId: task.taskId, taskType: type, token, payload: task.payload });
  } catch (error) {
    console.error(`[agent-gateway] attribution de ${type} ${task.taskId} à ${agent.name}`, error);
    if (agent.tasks.delete(task.taskId)) {
      await failTask(task, "Impossible d'attribuer la tâche", true);
    }
  }
}

/** Annule les tâches en cours dont l'objet a été supprimé par l'utilisateur. */
async function cancelTasks(subject: TaskSubject): Promise<void> {
  const boss = await getBoss();
  for (const agent of agents.values()) {
    for (const task of [...agent.tasks.values()]) {
      if (task.userId !== subject.userId || !handlerFor(task.type).concerns(task.payload, subject)) continue;
      agent.tasks.delete(task.taskId);
      send(agent.socket, { type: 'task.cancel', taskId: task.taskId });
      await boss.cancel(task.type, task.attempt);
      await revokeTaskTokens(task.taskId);
    }
  }
  void dispatch();
}

// ── Démarrage / arrêt ───────────────────────────────────────────

let monitor: NodeJS.Timeout | undefined;

const onEnqueued = () => void dispatch();
const onCancel = (subject: TaskSubject) => {
  cancelTasks(subject).catch((error: unknown) => console.error('[agent-gateway] annulation', error));
};

export function startGateway(): void {
  taskEvents.on('enqueued', onEnqueued);
  taskEvents.on('cancel', onCancel);
  monitor = setInterval(() => {
    const now = Date.now();
    for (const agent of agents.values()) {
      if (now - agent.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
        rejectConnection(agent.socket, 'heartbeat_timeout', 'Aucun heartbeat reçu');
        void dropAgent(agent, 'heartbeat manquant');
      }
    }
    // Rattrape les tâches remises en file par pg-boss (nouvelles tentatives, expirations).
    void dispatch();
  }, MONITOR_INTERVAL_MS);
}

export async function stopGateway(): Promise<void> {
  taskEvents.off('enqueued', onEnqueued);
  taskEvents.off('cancel', onCancel);
  clearInterval(monitor);
  for (const agent of [...agents.values()]) {
    agent.socket.close(1001, 'server_shutdown');
    await dropAgent(agent, 'arrêt du serveur');
  }
}

// ── Test de connexion et choix du modèle ───────────────────────

const pendingPings = new Map<string, (receivedAt: number) => void>();
const PING_TIMEOUT_MS = 5_000;

function primaryAgent(): ConnectedAgent | null {
  const embedModel = getEnv().EMBED_MODEL;
  return [...agents.values()].find((agent) => agent.embedModel === embedModel) ?? null;
}

/** Aller-retour WebSocket jusqu'à l'agent, en millisecondes. */
export async function pingAgent(): Promise<{ agent: string; latencyMs: number }> {
  const agent = primaryAgent();
  if (!agent) throw new AppError('agent_unavailable', "Aucun agent n'est connecté.");
  const nonce = randomUUID();
  const sentAt = Date.now();
  const receivedAt = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPings.delete(nonce);
      reject(new AppError('agent_unavailable', "L'agent ne répond pas."));
    }, PING_TIMEOUT_MS);
    pendingPings.set(nonce, (at) => {
      clearTimeout(timer);
      pendingPings.delete(nonce);
      resolve(at);
    });
    send(agent.socket, { type: 'ping', nonce });
  });
  return { agent: agent.name, latencyMs: receivedAt - sentAt };
}

export function getAgentModels() {
  const agent = primaryAgent();
  if (!agent) return null;
  return {
    agentKeyId: agent.agentKeyId,
    current: agent.chatModel,
    // Seuls les modèles capables d'appeler des outils peuvent servir au chat agentique.
    models: agent.models
      .filter((model) => model.capabilities.includes('tools'))
      .map((model) => ({ name: model.name, vision: model.capabilities.includes('vision'), thinking: model.capabilities.includes('thinking') })),
  };
}

/** Change le modèle de chat de la machine connectée et le mémorise pour ses prochaines connexions. */
export async function setAgentChatModel(chatModel: string): Promise<void> {
  const agent = primaryAgent();
  const info = getAgentModels();
  if (!agent || !info) throw new AppError('agent_unavailable', "Aucun agent n'est connecté.");
  if (!info.models.some((model) => model.name === chatModel)) {
    throw new AppError('validation', `Le modèle ${chatModel} n'est pas installé ou ne gère pas les outils.`);
  }
  await setAgentKeyChatModel(agent.agentKeyId, chatModel);
  send(agent.socket, { type: 'config.update', chatModel });
}

export function getAgentStatus() {
  const embedModel = getEnv().EMBED_MODEL;
  const agent = [...agents.values()].find((candidate) => candidate.embedModel === embedModel);
  return {
    online: Boolean(agent),
    agent: agent ? { name: agent.name, chatModel: agent.chatModel, activeTasks: agent.tasks.size, stats: agent.stats } : null,
  };
}

export function listConnectedAgents() {
  const embedModel = getEnv().EMBED_MODEL;
  return [...agents.values()].map((agent) => ({
    agentKeyId: agent.agentKeyId,
    name: agent.name,
    chatModel: agent.chatModel,
    embedModel: agent.embedModel,
    compatible: agent.embedModel === embedModel,
    activeTasks: agent.tasks.size,
    concurrency: agent.concurrency,
    connectedAt: new Date(agent.connectedAt).toISOString(),
  }));
}


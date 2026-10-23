import { z } from 'zod';
import { agentStepSchema } from './steps';
import { TASK_TYPES } from './tasks';

/**
 * Version du protocole serveur ↔ agent.
 * À incrémenter à chaque changement incompatible d'un message ci-dessous.
 */
// v2 : étapes multi-agents (orchestrateur, délégations aux spécialistes).
// v3 : l'agent lit l'IA de conversation de l'utilisateur (`GET /api/agent/llm`).
export const PROTOCOL_VERSION = 3;

export const AGENT_WS_PATH = '/_agent';

export const HEARTBEAT_INTERVAL_MS = 10_000;
/** Sans heartbeat pendant ce délai, le serveur considère l'agent hors ligne et remet ses tâches en file. */
export const HEARTBEAT_TIMEOUT_MS = 30_000;
/** Délai laissé à l'agent pour envoyer `hello` après l'ouverture de la connexion. */
export const HELLO_TIMEOUT_MS = 5_000;

export const AGENT_KEY_PREFIX = 'agk_';

// ── Agent → serveur ─────────────────────────────────────────────

export const helloMessageSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int(),
  agentKey: z.string().startsWith(AGENT_KEY_PREFIX),
  name: z.string().min(1).max(100),
  chatModel: z.string().min(1),
  embedModel: z.string().min(1),
  /** Nombre de tâches que l'agent accepte en parallèle. */
  concurrency: z.number().int().min(1).max(8),
  /** Modèles Ollama installés sur la machine, pour le choix du modèle de chat depuis l'app. */
  models: z.array(z.object({ name: z.string(), capabilities: z.array(z.string()) })).max(200).optional(),
});

/** Charge de la machine de l'agent, en pourcentage (VRAM absente sans GPU dédié mesurable). */
export const agentStatsSchema = z.object({
  cpu: z.number().min(0).max(100),
  ram: z.number().min(0).max(100),
  vram: z.number().min(0).max(100).nullable(),
});

export type AgentStats = z.infer<typeof agentStatsSchema>;

export const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  stats: agentStatsSchema.optional(),
});

export const taskStepMessageSchema = z.object({
  type: z.literal('task.step'),
  taskId: z.string(),
  step: agentStepSchema,
});

export const taskCompletedMessageSchema = z.object({
  type: z.literal('task.completed'),
  taskId: z.string(),
  /** Validé par le serveur avec `taskResultSchemas[type]`. */
  result: z.unknown(),
});

export const taskFailedMessageSchema = z.object({
  type: z.literal('task.failed'),
  taskId: z.string(),
  error: z.string(),
  /** `false` : inutile de réessayer (fichier illisible, etc.). */
  retryable: z.boolean(),
});

/** Réponse au `ping` du serveur (test de connexion depuis l'app). */
export const pongMessageSchema = z.object({
  type: z.literal('pong'),
  nonce: z.string(),
});

/** Résultat d'un changement de modèle de chat demandé par `config.update`. */
export const configAppliedMessageSchema = z.object({
  type: z.literal('config.applied'),
  chatModel: z.string(),
  error: z.string().optional(),
});

export const agentToServerMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  pongMessageSchema,
  configAppliedMessageSchema,
  heartbeatMessageSchema,
  taskStepMessageSchema,
  taskCompletedMessageSchema,
  taskFailedMessageSchema,
]);

export type AgentToServerMessage = z.infer<typeof agentToServerMessageSchema>;
export type HelloMessage = z.infer<typeof helloMessageSchema>;

// ── Serveur → agent ─────────────────────────────────────────────

export const welcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  agentId: z.string(),
  protocolVersion: z.number().int(),
  heartbeatIntervalMs: z.number().int().positive(),
});

export const PROTOCOL_ERROR_CODES = [
  'invalid_message',
  'unauthorized',
  'incompatible_protocol',
  'hello_timeout',
  /** Une autre connexion utilise la même clé : la plus récente est conservée. */
  'replaced',
  'revoked',
  'heartbeat_timeout',
] as const;

/** Erreurs après lesquelles l'agent ne doit pas se reconnecter (configuration à corriger). */
export const FATAL_PROTOCOL_ERRORS: readonly ProtocolErrorCode[] = ['unauthorized', 'incompatible_protocol', 'replaced', 'revoked'];

export const protocolErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.enum(PROTOCOL_ERROR_CODES),
  message: z.string(),
});

export const taskAssignMessageSchema = z.object({
  type: z.literal('task.assign'),
  taskId: z.string(),
  taskType: z.enum(TASK_TYPES),
  /** Token de tâche : limité à l'utilisateur concerné, à durée courte, invalidé à la fin de la tâche. */
  token: z.string(),
  /** Validé par l'agent avec `taskPayloadSchemas[taskType]`. */
  payload: z.unknown(),
});

export const taskCancelMessageSchema = z.object({
  type: z.literal('task.cancel'),
  taskId: z.string(),
});

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
  nonce: z.string(),
});

/** Demande de changement du modèle de chat (choisi par l'admin pour cette machine). */
export const configUpdateMessageSchema = z.object({
  type: z.literal('config.update'),
  chatModel: z.string().min(1),
});

export const serverToAgentMessageSchema = z.discriminatedUnion('type', [
  welcomeMessageSchema,
  pingMessageSchema,
  configUpdateMessageSchema,
  protocolErrorMessageSchema,
  taskAssignMessageSchema,
  taskCancelMessageSchema,
]);

export type ServerToAgentMessage = z.infer<typeof serverToAgentMessageSchema>;
export type TaskAssignMessage = z.infer<typeof taskAssignMessageSchema>;
export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

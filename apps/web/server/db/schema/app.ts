import {
  EMBEDDING_DIMENSIONS,
  type ActionTrigger,
  type AgentStep,
  type FileCategory,
  type ReminderStatus,
  type RiskLevel,
  type RoutineIcon,
  type RoutineRunStatus,
  type RoutineSchedule,
  type RoutineStep,
  type RoutineStepResult,
  type RoutineTrigger,
  type FileAnalysis,
  type FileStatus,
  type PendingActionStatus,
} from '@app/shared';
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

const userId = () => text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' });

/** Dossiers du drive, imbriqués (`parentId` null = racine). */
export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ...timestamps,
}, (table) => [index('folders_user_parent_idx').on(table.userId, table.parentId)]);

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  /** Dossier du fichier (`null` = racine du drive). */
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  status: text('status').$type<FileStatus>().notNull().default('pending'),
  analysis: jsonb('analysis').$type<FileAnalysis>(),
  /** Catégorie confirmée par l'utilisateur (la suggestion de l'agent est dans `analysis.category`). */
  category: text('category').$type<FileCategory>(),
  extractedText: text('extracted_text'),
  embedModel: text('embed_model'),
  error: text('error'),
  ...timestamps,
}, (table) => [index('files_user_id_idx').on(table.userId), index('files_folder_id_idx').on(table.userId, table.folderId)]);

export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  embedModel: text('embed_model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chunks_file_id_chunk_index_idx').on(table.fileId, table.chunkIndex),
  index('chunks_user_id_idx').on(table.userId),
  index('chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  title: text('title').notNull(),
  ...timestamps,
}, (table) => [index('conversations_user_id_idx').on(table.userId)]);

export type MessageRole = 'user' | 'assistant';
/** Suivi du traitement d'un message utilisateur par l'agent. */
export type MessageStatus = 'queued' | 'processing' | 'done' | 'failed';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').$type<MessageRole>().notNull(),
  content: text('content').notNull(),
  status: text('status').$type<MessageStatus>(),
  /** Pour une réponse de l'agent : le message utilisateur auquel elle répond (une seule réponse par message). */
  replyToId: uuid('reply_to_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('messages_conversation_id_idx').on(table.conversationId, table.createdAt),
  index('messages_user_id_idx').on(table.userId),
]);

export const agentSteps = pgTable('agent_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  /** Message utilisateur dont le traitement a produit cette étape. */
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  step: jsonb('step').$type<AgentStep>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_steps_message_id_idx').on(table.messageId, table.position),
  index('agent_steps_user_id_idx').on(table.userId),
]);

export const pendingActions = pgTable('pending_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  summary: text('summary').notNull(),
  status: text('status').$type<PendingActionStatus>().notNull().default('pending'),
  risk: text('risk').$type<RiskLevel>().notNull().default('confirm'),
  /** Hash du token à usage unique envoyé dans la notification. */
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  result: jsonb('result'),
  error: text('error'),
  ...timestamps,
}, (table) => [index('pending_actions_user_id_idx').on(table.userId, table.status)]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('push_subscriptions_user_id_idx').on(table.userId)]);

export type ConnectorProvider = 'google' | 'hue';

export const connectors = pgTable('connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  provider: text('provider').$type<ConnectorProvider>().notNull(),
  /** Tokens OAuth chiffrés (AES-256-GCM), jamais en clair. */
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scope: text('scope'),
  /** Données propres au connecteur (ex. clé d'application du pont Hue), chiffrées si sensibles. */
  metadata: jsonb('metadata').$type<Record<string, string>>(),
  ...timestamps,
}, (table) => [uniqueIndex('connectors_user_provider_idx').on(table.userId, table.provider)]);

/** Une clé par machine, stockée hashée, révocable individuellement. */
export const agentKeys = pgTable('agent_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  /** Début de la clé, affiché dans l'admin pour la reconnaître. */
  keyPrefix: text('key_prefix').notNull(),
  /** Modèle de chat choisi par l'admin pour cette machine (sinon celui du .env de l'agent). */
  chatModel: text('chat_model'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Token remis à l'agent pour une tâche : limité à un utilisateur, à durée courte, révoqué en fin de tâche. */
export const taskTokens = pgTable('task_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  taskId: text('task_id').notNull(),
  /** Conversation concernée (tâches de chat) : les actions proposées y sont rattachées. */
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('task_tokens_task_id_idx').on(table.taskId)]);

export type ReminderSource = 'agent' | 'user' | 'deadline' | 'routine';

export const reminders = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  text: text('text').notNull(),
  remindAt: timestamp('remind_at', { withTimezone: true }).notNull(),
  status: text('status').$type<ReminderStatus>().notNull().default('scheduled'),
  source: text('source').$type<ReminderSource>().notNull(),
  fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [index('reminders_user_id_idx').on(table.userId, table.remindAt)]);

/** Journal des actions exécutées sans validation (niveau `direct`), avec leur origine. */
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  summary: text('summary').notNull(),
  trigger: text('trigger').$type<ActionTrigger>().notNull(),
  /** Précision sur l'origine : conversation, routine ou tag concerné. */
  triggerRef: text('trigger_ref'),
  status: text('status').$type<'executed' | 'failed' | 'undone'>().notNull(),
  result: jsonb('result'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('activity_log_user_id_idx').on(table.userId, table.createdAt)]);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  /** Fuseau IANA de l'utilisateur (détecté par le navigateur), pour le résumé quotidien. */
  timezone: text('timezone').notNull().default('Europe/Paris'),
  digestEnabled: boolean('digest_enabled').notNull().default(false),
  /** Heure locale d'envoi du résumé (0-23). */
  digestHour: integer('digest_hour').notNull().default(8),
  lastDigestOn: date('last_digest_on'),
  notifyDocumentReady: boolean('notify_document_ready').notNull().default(true),
  notifyReplyReady: boolean('notify_reply_ready').notNull().default(true),
  /** Verrouillage de l'app après N minutes d'inactivité (`null` : désactivé). */
  lockAfterMinutes: integer('lock_after_minutes'),
  /** Exiger Face ID / empreinte pour les actions sensibles (quand une passkey existe). */
  biometricForSensitive: boolean('biometric_for_sensitive').notNull().default(true),
  ...timestamps,
});

export const routines = pgTable('routines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  name: text('name').notNull(),
  icon: text('icon').$type<RoutineIcon>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  schedule: jsonb('schedule').$type<RoutineSchedule>(),
  steps: jsonb('steps').$type<RoutineStep[]>().notNull(),
  /** Dernière minute de déclenchement horaire (évite une double exécution dans la même minute). */
  lastScheduledFor: text('last_scheduled_for'),
  ...timestamps,
}, (table) => [index('routines_user_id_idx').on(table.userId)]);

export const routineRuns = pgTable('routine_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  routineId: uuid('routine_id').notNull().references(() => routines.id, { onDelete: 'cascade' }),
  trigger: text('trigger').$type<RoutineTrigger>().notNull(),
  /** Tag NFC ou discussion à l'origine de l'exécution. */
  triggerRef: text('trigger_ref'),
  status: text('status').$type<RoutineRunStatus>().notNull(),
  steps: jsonb('steps').$type<RoutineStepResult[]>().notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('routine_runs_routine_idx').on(table.routineId, table.createdAt), index('routine_runs_user_idx').on(table.userId, table.createdAt)]);

export const nfcTags = pgTable('nfc_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  /** Identifiant écrit dans l'URL du tag : aléatoire et non devinable. */
  publicId: text('public_id').notNull().unique(),
  name: text('name').notNull(),
  icon: text('icon').$type<RoutineIcon>().notNull().default('house'),
  routineId: uuid('routine_id').references(() => routines.id, { onDelete: 'set null' }),
  scanCount: integer('scan_count').notNull().default(0),
  lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('nfc_tags_user_id_idx').on(table.userId)]);

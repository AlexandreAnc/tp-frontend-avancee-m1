import { describe, expect, it } from 'vitest';
import {
  agentToServerMessageSchema,
  delegationInputSchema,
  delegationToolName,
  FATAL_PROTOCOL_ERRORS,
  formatBytes,
  isImageMimeType,
  isAllowedMimeType,
  IMAGE_MIME_TYPES,
  PROTOCOL_ERROR_CODES,
  serverToAgentMessageSchema,
  SPECIALIST_NAMES,
  specialistForDelegationTool,
  taskPayloadSchemas,
  toolDefinitions,
  TOOL_NAMES,
} from '../src';

describe('messages serveur → agent', () => {
  it('valide chaque type de message attendu par l’agent', () => {
    const messages = [
      { type: 'welcome', agentId: 'a1', protocolVersion: 3, heartbeatIntervalMs: 10_000 },
      { type: 'ping', nonce: 'n1' },
      { type: 'config.update', chatModel: 'qwen3:8b' },
      { type: 'error', code: 'revoked', message: 'Clé révoquée' },
      { type: 'task.assign', taskId: 't1', taskType: 'file.index', token: 'tok', payload: {} },
      { type: 'task.cancel', taskId: 't1' },
    ];
    for (const message of messages) expect(serverToAgentMessageSchema.safeParse(message).success, message.type).toBe(true);
  });

  it('refuse un code d’erreur, un type de tâche ou un intervalle de heartbeat invalides', () => {
    expect(serverToAgentMessageSchema.safeParse({ type: 'error', code: 'teapot', message: 'x' }).success).toBe(false);
    expect(serverToAgentMessageSchema.safeParse({ type: 'task.assign', taskId: 't', taskType: 'shell', token: 't', payload: {} }).success).toBe(false);
    expect(serverToAgentMessageSchema.safeParse({ type: 'welcome', agentId: 'a', protocolVersion: 3, heartbeatIntervalMs: 0 }).success).toBe(false);
    expect(serverToAgentMessageSchema.safeParse({ type: 'config.update', chatModel: '' }).success).toBe(false);
  });

  it('les erreurs fatales sont des codes connus, et une coupure de heartbeat n’en est pas une', () => {
    for (const code of FATAL_PROTOCOL_ERRORS) expect(PROTOCOL_ERROR_CODES).toContain(code);
    expect(FATAL_PROTOCOL_ERRORS).not.toContain('heartbeat_timeout');
  });
});

describe('messages agent → serveur', () => {
  it('borne les statistiques de la machine (VRAM absente sans GPU mesurable)', () => {
    expect(agentToServerMessageSchema.safeParse({ type: 'heartbeat' }).success).toBe(true);
    expect(agentToServerMessageSchema.safeParse({ type: 'heartbeat', stats: { cpu: 12, ram: 50, vram: null } }).success).toBe(true);
    expect(agentToServerMessageSchema.safeParse({ type: 'heartbeat', stats: { cpu: 120, ram: 50, vram: null } }).success).toBe(false);
  });

  it('exige l’information « réessayable » sur un échec de tâche', () => {
    expect(agentToServerMessageSchema.safeParse({ type: 'task.failed', taskId: 't', error: 'x', retryable: false }).success).toBe(true);
    expect(agentToServerMessageSchema.safeParse({ type: 'task.failed', taskId: 't', error: 'x' }).success).toBe(false);
  });
});

describe('payloads de tâche', () => {
  it('valide les identifiants de fichier et de conversation', () => {
    const fileId = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';
    expect(taskPayloadSchemas['file.index'].safeParse({ fileId, fileName: 'a.pdf', mimeType: 'application/pdf' }).success).toBe(true);
    expect(taskPayloadSchemas['file.index'].safeParse({ fileId: '42', fileName: 'a.pdf', mimeType: 'application/pdf' }).success).toBe(false);
    expect(taskPayloadSchemas['chat.reply'].safeParse({ conversationId: fileId, messageId: fileId, history: [{ role: 'system', content: 'x' }] }).success).toBe(false);
  });
});

describe('délégation', () => {
  it('fait l’aller-retour entre spécialiste et outil de délégation', () => {
    for (const name of SPECIALIST_NAMES) expect(specialistForDelegationTool(delegationToolName(name))).toBe(name);
    expect(delegationToolName('home')).toBe('ask_home');
    expect(specialistForDelegationTool('ask_garage')).toBeNull();
    expect(specialistForDelegationTool('documents')).toBeNull();
  });

  it('refuse une consigne vide', () => {
    expect(delegationInputSchema.safeParse({ task: '' }).success).toBe(false);
  });
});

describe('outils', () => {
  it('chaque définition porte le nom de sa clé et une description', () => {
    for (const name of TOOL_NAMES) {
      expect(toolDefinitions[name].name).toBe(name);
      expect(toolDefinitions[name].description.length).toBeGreaterThan(10);
    }
  });

  it('les heures de l’agenda sont locales (sans décalage) côté modèle', () => {
    const input = toolDefinitions.create_calendar_event.input;
    expect(input.safeParse({ title: 'A', start: '2026-11-14T09:00', end: '2026-11-14T10:00' }).success).toBe(true);
    expect(input.safeParse({ title: 'A', start: '2026-11-14T09:00:00+01:00', end: '2026-11-14T10:00' }).success).toBe(false);
  });
});

describe('types de fichiers et tailles', () => {
  it('les images lues par le modèle vision sont des types autorisés', () => {
    for (const type of IMAGE_MIME_TYPES) {
      expect(isImageMimeType(type)).toBe(true);
      expect(isAllowedMimeType(type)).toBe(true);
    }
    expect(isImageMimeType('application/pdf')).toBe(false);
    expect(isImageMimeType('image/gif')).toBe(false);
  });

  it('arrondit en Ko et affiche les Go avec une virgule', () => {
    expect(formatBytes(1023)).toBe('1023 o');
    expect(formatBytes(1024)).toBe('1 Ko');
    expect(formatBytes(1536)).toBe('2 Ko');
    expect(formatBytes(1024 ** 3)).toBe('1,0 Go');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1,5 Go');
  });
});

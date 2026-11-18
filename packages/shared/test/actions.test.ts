import { describe, expect, it } from 'vitest';
import {
  ACTION_RISK,
  ACTION_TYPES,
  actionPayloadSchemas,
  agendaQuerySchema,
  chatLlmConfigSchema,
  createActionResponseSchema,
  EXTERNAL_AI_PROVIDERS,
  hueLightPayloadSchema,
  hueRoomPayloadSchema,
  proposedActionSchema,
  reminderPayloadSchema,
  routineInputSchema,
} from '../src';

const FILE_ID = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';

describe('actions', () => {
  it('chaque type d’action a un niveau de risque et un schéma de payload', () => {
    expect(Object.keys(ACTION_RISK).sort()).toEqual([...ACTION_TYPES].sort());
    expect(ACTION_TYPES).toEqual(Object.keys(actionPayloadSchemas));
    // Seul l'ajout à Google Agenda (visible par des tiers) demande une validation.
    expect(ACTION_TYPES.filter((type) => ACTION_RISK[type] !== 'direct')).toEqual(['google_calendar.create_event']);
  });

  it.each([
    ['pièce', hueRoomPayloadSchema, { roomId: 'salon' }],
    ['lampe', hueLightPayloadSchema, { lightId: 'l1' }],
  ] as const)('une commande de %s doit changer l’état ou la luminosité', (_label, schema, target) => {
    expect(schema.safeParse({ ...target, on: false }).success).toBe(true);
    expect(schema.safeParse({ ...target, brightness: 40 }).success).toBe(true);
    const empty = schema.safeParse(target);
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe('Indiquez on ou brightness');
    expect(schema.safeParse({ ...target, brightness: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...target, brightness: 101 }).success).toBe(false);
  });

  it('accepte « all » pour toute la maison', () => {
    expect(hueRoomPayloadSchema.safeParse({ roomId: 'all', on: true }).success).toBe(true);
    expect(hueRoomPayloadSchema.safeParse({ roomId: '', on: true }).success).toBe(false);
  });

  it('un rappel exige un texte non vide (espaces retirés) et une date avec décalage', () => {
    expect(reminderPayloadSchema.parse({ text: '  Payer EDF ', remindAt: '2026-11-02T09:00:00+01:00' }).text).toBe('Payer EDF');
    expect(reminderPayloadSchema.safeParse({ text: '   ', remindAt: '2026-11-02T09:00:00+01:00' }).success).toBe(false);
    expect(reminderPayloadSchema.safeParse({ text: 'x', remindAt: '2026-11-02T09:00' }).success).toBe(false);
  });

  it('refuse une action dont le payload ne correspond pas au type annoncé', () => {
    expect(proposedActionSchema.safeParse({ type: 'drive.move_file', payload: { fileId: FILE_ID, folderPath: '' } }).success).toBe(true);
    expect(proposedActionSchema.safeParse({ type: 'drive.move_file', payload: { sceneId: 's1' } }).success).toBe(false);
    expect(proposedActionSchema.safeParse({ type: 'shell.exec', payload: {} }).success).toBe(false);
  });

  it('distingue une action en attente d’une action exécutée', () => {
    expect(createActionResponseSchema.parse({ status: 'pending', actionId: FILE_ID, expiresAt: 'x' }).status).toBe('pending');
    expect(createActionResponseSchema.safeParse({ status: 'executed', actionId: FILE_ID }).success).toBe(false);
  });
});

describe('agendaQuerySchema', () => {
  it('exige une fin de période après le début', () => {
    expect(agendaQuerySchema.safeParse({ from: '2026-11-01T00:00:00+01:00', to: '2026-11-08T00:00:00+01:00' }).success).toBe(true);
    const reversed = agendaQuerySchema.safeParse({ from: '2026-11-08T00:00:00+01:00', to: '2026-11-01T00:00:00+01:00' });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]).toMatchObject({ message: 'Période invalide', path: ['to'] });
  });
});

describe('fournisseurs d’IA', () => {
  it('ne transmet une clé que pour un fournisseur externe', () => {
    expect(chatLlmConfigSchema.parse({ provider: 'dashia' })).toEqual({ provider: 'dashia' });
    expect(chatLlmConfigSchema.safeParse({ provider: 'mistral', model: 'mistral-large' }).success).toBe(false);
    expect(chatLlmConfigSchema.safeParse({ provider: 'inconnu', model: 'x', apiKey: 'k' }).success).toBe(false);
  });

  it('donne une URL d’API à chaque fournisseur compatible OpenAI', () => {
    for (const definition of Object.values(EXTERNAL_AI_PROVIDERS)) {
      if (definition.api === 'openai') expect(definition.baseUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('routines', () => {
  const step = { type: 'notify', text: 'Bonjour', label: 'Notification' };

  it('applique les valeurs par défaut (active, sans horaire)', () => {
    expect(routineInputSchema.parse({ name: ' Bonjour ', icon: 'sun', steps: [step] })).toEqual({
      name: 'Bonjour', icon: 'sun', enabled: true, schedule: null, steps: [step],
    });
  });

  it('refuse un horaire invalide, une routine vide ou une étape inconnue', () => {
    const base = { name: 'Nuit', icon: 'moon', steps: [step] };
    expect(routineInputSchema.safeParse({ ...base, schedule: { time: '22:30', days: [1, 7] } }).success).toBe(true);
    expect(routineInputSchema.safeParse({ ...base, schedule: { time: '24:00', days: [1] } }).success).toBe(false);
    expect(routineInputSchema.safeParse({ ...base, schedule: { time: '22:30', days: [0] } }).success).toBe(false);
    expect(routineInputSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
    expect(routineInputSchema.safeParse({ ...base, steps: [{ type: 'shell', label: 'x' }] }).success).toBe(false);
  });
});

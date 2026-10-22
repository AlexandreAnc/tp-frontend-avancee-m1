import { z } from 'zod';

/** Payload d'un événement Google Agenda proposé par l'agent. Dates au format ISO 8601. */
export const calendarEventPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  description: z.string().max(2000).optional(),
  location: z.string().max(300).optional(),
}).refine((event) => new Date(event.end) > new Date(event.start), {
  message: 'La fin doit être postérieure au début',
  path: ['end'],
});

export type CalendarEventPayload = z.infer<typeof calendarEventPayloadSchema>;

/** Rappel envoyé par notification push à l'heure dite. */
export const reminderPayloadSchema = z.object({
  text: z.string().trim().min(1).max(300),
  remindAt: z.iso.datetime({ offset: true }),
  /** Document à l'origine du rappel (ex. facture et son échéance). */
  fileId: z.uuid().optional(),
});

export type ReminderPayload = z.infer<typeof reminderPayloadSchema>;

const brightness = z.number().int().min(1).max(100);

/** Pièce (ou toute la maison avec `all`) : allumer / éteindre / luminosité en %. */
export const hueRoomPayloadSchema = z.object({
  roomId: z.union([z.literal('all'), z.string().min(1)]),
  on: z.boolean().optional(),
  brightness: brightness.optional(),
}).refine((payload) => payload.on !== undefined || payload.brightness !== undefined, { message: 'Indiquez on ou brightness' });

export const hueLightPayloadSchema = z.object({
  lightId: z.string().min(1),
  on: z.boolean().optional(),
  brightness: brightness.optional(),
}).refine((payload) => payload.on !== undefined || payload.brightness !== undefined, { message: 'Indiquez on ou brightness' });

export const hueScenePayloadSchema = z.object({ sceneId: z.string().min(1) });

/** Range un fichier dans un dossier du drive (chemin « Logement/2026 », créé au besoin ; vide = racine). */
export const driveMovePayloadSchema = z.object({
  fileId: z.uuid(),
  folderPath: z.string().max(500),
});

/** Toutes les actions à effet de bord que l'agent peut déclencher, avec le schéma de leur payload. */
export const actionPayloadSchemas = {
  'google_calendar.create_event': calendarEventPayloadSchema,
  'reminder.create': reminderPayloadSchema,
  'hue.set_room': hueRoomPayloadSchema,
  'hue.set_light': hueLightPayloadSchema,
  'hue.activate_scene': hueScenePayloadSchema,
  'drive.move_file': driveMovePayloadSchema,
} as const;

export type ActionType = keyof typeof actionPayloadSchemas;
export const ACTION_TYPES = Object.keys(actionPayloadSchemas) as ActionType[];

/**
 * Niveau de risque d'une action, défini ici et jamais par l'agent :
 * - `direct` : exécutée tout de suite par le serveur et inscrite au journal d'activité ;
 * - `confirm` : `pending_action` exécutée seulement après validation de l'utilisateur ;
 * - `sensitive` : `pending_action` validée avec une vérification passkey récente.
 */
export const RISK_LEVELS = ['direct', 'confirm', 'sensitive'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ACTION_RISK: Record<ActionType, RiskLevel> = {
  'google_calendar.create_event': 'confirm',
  'reminder.create': 'direct',
  'hue.set_room': 'direct',
  'hue.set_light': 'direct',
  'hue.activate_scene': 'direct',
  'drive.move_file': 'direct',
};

export const proposedActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('google_calendar.create_event'), payload: calendarEventPayloadSchema }),
  z.object({ type: z.literal('reminder.create'), payload: reminderPayloadSchema }),
  z.object({ type: z.literal('hue.set_room'), payload: hueRoomPayloadSchema }),
  z.object({ type: z.literal('hue.set_light'), payload: hueLightPayloadSchema }),
  z.object({ type: z.literal('hue.activate_scene'), payload: hueScenePayloadSchema }),
  z.object({ type: z.literal('drive.move_file'), payload: driveMovePayloadSchema }),
]);

export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const PENDING_ACTION_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'executed', 'failed'] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

/**
 * Décision sur une action. Depuis l'app, la session suffit. Depuis une notification, le token
 * à usage unique de l'action suffit (la session peut avoir expiré entre-temps).
 */
export const actionDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  token: z.string().min(1).optional(),
});

export type ActionDecision = z.infer<typeof actionDecisionSchema>;

/** Origine d'une action exécutée, affichée dans le journal d'activité. */
export const ACTION_TRIGGERS = ['agent', 'panel', 'routine', 'tag', 'schedule'] as const;
export type ActionTrigger = (typeof ACTION_TRIGGERS)[number];

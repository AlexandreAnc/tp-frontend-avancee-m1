import { z } from 'zod';
import { hueRoomPayloadSchema, hueScenePayloadSchema } from './actions';

/** Étapes possibles d'une routine, exécutées dans l'ordre par le serveur. */
export const routineStepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hue.set_room'), payload: hueRoomPayloadSchema, label: z.string().max(120) }),
  z.object({ type: z.literal('hue.activate_scene'), payload: hueScenePayloadSchema, label: z.string().max(120) }),
  /** Rappel programmé N minutes après l'exécution. */
  z.object({ type: z.literal('reminder'), text: z.string().min(1).max(300), offsetMinutes: z.number().int().min(1).max(7 * 24 * 60), label: z.string().max(120) }),
  /** Notification immédiate (ex. récap du jour). */
  z.object({ type: z.literal('notify'), text: z.string().min(1).max(300), label: z.string().max(120) }),
  /** Question posée à l'agent ; sa réponse arrive dans une discussion (et en notification si l'app est fermée). */
  z.object({ type: z.literal('agent'), prompt: z.string().min(1).max(1000), label: z.string().max(120) }),
]);

export type RoutineStep = z.infer<typeof routineStepSchema>;

export const ROUTINE_ICONS = ['sun', 'moon', 'door-exit', 'house', 'laptop', 'bed', 'car', 'mug', 'film', 'lightbulb'] as const;
export type RoutineIcon = (typeof ROUTINE_ICONS)[number];

/** Déclenchement horaire : heure locale et jours (1 = lundi … 7 = dimanche). */
export const routineScheduleSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});

export type RoutineSchedule = z.infer<typeof routineScheduleSchema>;

export const routineInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.enum(ROUTINE_ICONS),
  enabled: z.boolean().default(true),
  schedule: routineScheduleSchema.nullable().default(null),
  steps: z.array(routineStepSchema).min(1).max(12),
});

export type RoutineInput = z.infer<typeof routineInputSchema>;

export const ROUTINE_TRIGGERS = ['manual', 'tag', 'schedule', 'agent'] as const;
export type RoutineTrigger = (typeof ROUTINE_TRIGGERS)[number];

export interface RoutineStepResult {
  label: string;
  status: 'success' | 'failed' | 'queued';
  durationMs: number;
  error: string | null;
  /** Page à ouvrir dans l'app après l'exécution (ex. discussion de la question posée). */
  openUrl?: string;
}

export type RoutineRunStatus = 'success' | 'partial' | 'failed';

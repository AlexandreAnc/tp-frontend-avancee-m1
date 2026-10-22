import { z } from 'zod';

/** État de la maison (Philips Hue) tel qu'affiché dans l'app et transmis à l'agent. */
export const homeLightSchema = z.object({
  id: z.string(),
  name: z.string(),
  on: z.boolean(),
  /** Luminosité en % (null si la lampe n'est pas variable). */
  brightness: z.number().nullable(),
  reachable: z.boolean(),
});

export const homeRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Pièces (room) et zones (zone) Hue. */
  kind: z.enum(['room', 'zone']),
  archetype: z.string().nullable(),
  on: z.boolean(),
  brightness: z.number().nullable(),
  lights: z.array(homeLightSchema),
});

export const homeSceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  roomId: z.string().nullable(),
});

export const homeStateSchema = z.object({
  connected: z.boolean(),
  rooms: z.array(homeRoomSchema),
  scenes: z.array(homeSceneSchema),
});

export type HomeLight = z.infer<typeof homeLightSchema>;
export type HomeRoom = z.infer<typeof homeRoomSchema>;
export type HomeScene = z.infer<typeof homeSceneSchema>;
export type HomeState = z.infer<typeof homeStateSchema>;

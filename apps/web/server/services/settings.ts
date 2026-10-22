import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';

const { userSettings } = schema;

export const settingsUpdateSchema = z.object({
  timezone: z.string().min(1).max(64).refine(isValidTimezone, { message: 'Fuseau horaire inconnu' }).optional(),
  digestEnabled: z.boolean().optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  notifyDocumentReady: z.boolean().optional(),
  notifyReplyReady: z.boolean().optional(),
  lockAfterMinutes: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(15), z.literal(60)]).nullable().optional(),
  biometricForSensitive: z.boolean().optional(),
  autoFileDocuments: z.boolean().optional(),
});

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function toSettingsDto(row: typeof userSettings.$inferSelect) {
  return {
    timezone: row.timezone,
    digestEnabled: row.digestEnabled,
    digestHour: row.digestHour,
    notifyDocumentReady: row.notifyDocumentReady,
    notifyReplyReady: row.notifyReplyReady,
    lockAfterMinutes: row.lockAfterMinutes,
    biometricForSensitive: row.biometricForSensitive,
    autoFileDocuments: row.autoFileDocuments,
    hasUnlockPin: row.unlockPinHash !== null,
  };
}

export type SettingsDto = ReturnType<typeof toSettingsDto>;

/** Réglages de l'utilisateur, créés avec les valeurs par défaut au premier accès. */
export async function getSettings(userId: string) {
  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(userSettings).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(userSettings).where(eq(userSettings.userId, userId)))[0]!;
}

export async function updateSettings(userId: string, update: SettingsUpdate): Promise<SettingsDto> {
  await getSettings(userId);
  const [row] = await db.update(userSettings).set(update).where(eq(userSettings.userId, userId)).returning();
  return toSettingsDto(row!);
}

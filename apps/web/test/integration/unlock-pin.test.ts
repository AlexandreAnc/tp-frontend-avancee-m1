import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '../../server/db';
import { getSettings, toSettingsDto } from '../../server/services/settings';
import { MAX_PIN_FAILURES, removeUnlockPin, setUnlockPin, verifyUnlockPin } from '../../server/services/unlock-pin';
import { createUser, skipDb } from './helpers';

describe.skipIf(skipDb)('code de secours', () => {
  it('stocke un hash (jamais le code) et ne l’expose pas', async () => {
    const userId = await createUser();
    await setUnlockPin(userId, '482915');
    const settings = await getSettings(userId);
    expect(settings.unlockPinHash).not.toContain('482915');
    expect(toSettingsDto(settings)).toMatchObject({ hasUnlockPin: true });
    expect(JSON.stringify(toSettingsDto(settings))).not.toContain(settings.unlockPinHash!);
    await verifyUnlockPin(userId, '482915');
  });

  it('refuse un code mal formé', async () => {
    const userId = await createUser();
    await expect(setUnlockPin(userId, '1234')).rejects.toMatchObject({ code: 'validation' });
    await expect(setUnlockPin(userId, 'abcdef')).rejects.toMatchObject({ code: 'validation' });
  });

  it('bloque 15 minutes après 5 essais faux, même avec le bon code', async () => {
    const userId = await createUser();
    await setUnlockPin(userId, '482915');
    for (let attempt = 1; attempt < MAX_PIN_FAILURES; attempt++) {
      await expect(verifyUnlockPin(userId, '000000')).rejects.toMatchObject({ code: 'forbidden' });
    }
    await expect(verifyUnlockPin(userId, '000000')).rejects.toMatchObject({ message: expect.stringContaining('bloqué') });
    await expect(verifyUnlockPin(userId, '482915')).rejects.toMatchObject({ code: 'rate_limited' });

    const later = new Date(Date.now() + 16 * 60 * 1000);
    await verifyUnlockPin(userId, '482915', later);
  });

  it('compte chaque essai, même envoyés en parallèle : jamais plus de 5 essais avant le blocage', async () => {
    const userId = await createUser();
    await setUnlockPin(userId, '482915');
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => verifyUnlockPin(userId, '000000')));
    const codes = results.map((result) => (result as PromiseRejectedResult).reason.code);
    expect(codes.filter((code) => code === 'forbidden')).toHaveLength(MAX_PIN_FAILURES);
    expect(codes.filter((code) => code === 'rate_limited')).toHaveLength(12 - MAX_PIN_FAILURES);
    await expect(verifyUnlockPin(userId, '482915')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('remet le compteur à zéro après un bon code', async () => {
    const userId = await createUser();
    await setUnlockPin(userId, '482915');
    await expect(verifyUnlockPin(userId, '111111')).rejects.toMatchObject({ code: 'forbidden' });
    await verifyUnlockPin(userId, '482915');
    const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
    expect(row?.unlockPinFailures).toBe(0);
  });

  it('sans code défini, la vérification échoue', async () => {
    const userId = await createUser();
    await setUnlockPin(userId, '482915');
    await removeUnlockPin(userId);
    await expect(verifyUnlockPin(userId, '482915')).rejects.toMatchObject({ code: 'conflict' });
  });
});

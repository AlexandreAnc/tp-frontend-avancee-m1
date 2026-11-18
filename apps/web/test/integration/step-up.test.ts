import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { createSession, createUser, skipDb } from './helpers';

const generateAuthenticationOptions = vi.fn(async (options: Record<string, unknown>) => ({ ...options, challenge: `challenge-${randomUUID()}` }));
const verifyAuthenticationResponse = vi.fn();
vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: (options: Record<string, unknown>) => generateAuthenticationOptions(options),
  verifyAuthenticationResponse: (options: unknown) => verifyAuthenticationResponse(options),
}));

const stepUp = await import('../../server/services/step-up');

async function addPasskey(userId: string, transports: string | null = 'internal,hybrid') {
  const credentialID = randomUUID();
  await db.insert(schema.passkey).values({
    id: randomUUID(), userId, publicKey: Buffer.from('cle-publique').toString('base64'), credentialID, counter: 3, deviceType: 'singleDevice', backedUp: false, transports,
  });
  return credentialID;
}

/** Réponse WebAuthn minimale : seul l'identifiant compte ici, la signature est vérifiée par la librairie (simulée). */
const responseFor = (credentialId: string) => ({ id: credentialId }) as Parameters<typeof stepUp.verifyStepUp>[2];

describe.skipIf(skipDb)('vérification biométrique (step-up)', () => {
  afterEach(() => vi.useRealTimers());

  it('exige une passkey enregistrée', async () => {
    const userId = await createUser();
    expect(await stepUp.hasPasskey(userId)).toBe(false);
    await expect(stepUp.createStepUpOptions(userId, 'session')).rejects.toMatchObject({ code: 'validation' });
  });

  it("ne propose que les passkeys de l'utilisateur, avec vérification obligatoire", async () => {
    const userId = await createUser();
    const other = await createUser();
    const credentialId = await addPasskey(userId);
    await addPasskey(other);
    const options = await stepUp.createStepUpOptions(userId, await createSession(userId));
    expect(options).toMatchObject({
      rpID: 'localhost',
      userVerification: 'required',
      allowCredentials: [{ id: credentialId, transports: ['internal', 'hybrid'] }],
    });
  });

  it('rattache la vérification réussie à la session et met à jour le compteur', async () => {
    const userId = await createUser();
    const credentialId = await addPasskey(userId, null);
    const sessionId = await createSession(userId);
    const options = await stepUp.createStepUpOptions(userId, sessionId);
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 4 } });

    expect(await stepUp.hasRecentStepUp(sessionId)).toBe(false);
    await stepUp.verifyStepUp(userId, sessionId, responseFor(credentialId));

    expect(verifyAuthenticationResponse).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedChallenge: options.challenge,
      expectedOrigin: 'http://localhost:3000',
      expectedRPID: 'localhost',
      requireUserVerification: true,
      credential: expect.objectContaining({ id: credentialId, counter: 3 }),
    }));
    expect(await stepUp.hasRecentStepUp(sessionId)).toBe(true);
    expect(await stepUp.hasRecentStepUp(randomUUID())).toBe(false);
    const [row] = await db.select().from(schema.passkey).where(eq(schema.passkey.credentialID, credentialId));
    expect(row?.counter).toBe(4);
  });

  it('refuse un défi absent, déjà utilisé ou expiré', async () => {
    const userId = await createUser();
    const credentialId = await addPasskey(userId);
    const sessionId = await createSession(userId);
    await expect(stepUp.verifyStepUp(userId, sessionId, responseFor(credentialId))).rejects.toMatchObject({ code: 'unauthorized' });

    await stepUp.createStepUpOptions(userId, sessionId);
    verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 4 } });
    await stepUp.verifyStepUp(userId, sessionId, responseFor(credentialId));
    await expect(stepUp.verifyStepUp(userId, sessionId, responseFor(credentialId))).rejects.toMatchObject({ code: 'unauthorized' });

    await stepUp.createStepUpOptions(userId, sessionId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3 * 60_000);
    await expect(stepUp.verifyStepUp(userId, sessionId, responseFor(credentialId))).rejects.toMatchObject({ message: 'Vérification expirée, recommencez.' });
  });

  it("refuse la passkey d'un autre compte et une signature invalide", async () => {
    const userId = await createUser();
    const intruder = await createUser();
    const intruderCredential = await addPasskey(intruder);
    const credentialId = await addPasskey(userId);
    const sessionId = await createSession(userId);

    await stepUp.createStepUpOptions(userId, sessionId);
    await expect(stepUp.verifyStepUp(userId, sessionId, responseFor(intruderCredential))).rejects.toMatchObject({ message: 'Passkey inconnue pour ce compte.' });

    await stepUp.createStepUpOptions(userId, sessionId);
    verifyAuthenticationResponse.mockRejectedValueOnce(new Error('signature invalide'));
    await expect(stepUp.verifyStepUp(userId, sessionId, responseFor(credentialId))).rejects.toMatchObject({ message: 'Vérification biométrique refusée.' });
    expect(await stepUp.hasRecentStepUp(sessionId)).toBe(false);
  });

  it('ne demande rien sans passkey, et exige une vérification récente sinon', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);
    await expect(stepUp.requireStepUpIfEnabled(userId, sessionId)).resolves.toBeUndefined();
    await addPasskey(userId);
    await expect(stepUp.requireStepUpIfEnabled(userId, sessionId)).rejects.toMatchObject({ code: 'step_up_required' });
  });
});

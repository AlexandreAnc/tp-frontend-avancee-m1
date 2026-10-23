import { describe, expect, it } from 'vitest';
import { deleteHueApp, getHueApp, getHueAppSettings, saveHueApp } from '../../server/services/hue';
import { createUser, skipDb } from './helpers';

describe.skipIf(skipDb)('application Philips Hue par utilisateur', () => {
  it('utilise l’application de l’utilisateur à la place de celle du serveur, sans jamais exposer le secret', async () => {
    const userId = await createUser();
    expect(await getHueApp(userId)).toEqual({ clientId: 'hue-client', clientSecret: 'hue-secret' });

    await saveHueApp(userId, 'mon-client', 'mon-secret-tres-long');
    expect(await getHueApp(userId)).toEqual({ clientId: 'mon-client', clientSecret: 'mon-secret-tres-long' });
    const settings = await getHueAppSettings(userId);
    expect(settings).toMatchObject({ ownClientId: 'mon-client', serverApp: true, redirectUri: 'http://localhost:3000/api/connectors/hue/callback' });
    expect(JSON.stringify(settings)).not.toContain('mon-secret');

    await deleteHueApp(userId);
    expect(await getHueApp(userId)).toEqual({ clientId: 'hue-client', clientSecret: 'hue-secret' });
  });

  it('isole les applications entre utilisateurs', async () => {
    const alice = await createUser();
    const bob = await createUser();
    await saveHueApp(alice, 'client-alice', 'secret-alice-123');
    expect((await getHueApp(bob))?.clientId).toBe('hue-client');
    expect((await getHueAppSettings(bob)).ownClientId).toBeNull();
  });
});

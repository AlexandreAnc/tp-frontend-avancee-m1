import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { createUser, embedding, skipDb } from './helpers';

vi.mock('../../server/services/push', () => ({ sendToUser: vi.fn() }));

const { exactSearch, semanticSearch } = await import('../../server/services/search');
const tags = await import('../../server/services/tags');
const { createRoutine } = await import('../../server/services/routines');

/** Document indexé : un chunk par texte, embeddings proches de `vector`. */
async function indexedFile(userId: string, name: string, texts: string[], options: { vector?: number; deletedAt?: Date; embedModel?: string } = {}) {
  const [file] = await db.insert(schema.files).values({
    userId, name, mimeType: 'text/plain', sizeBytes: 1, storageKey: randomUUID(), status: 'ready', deletedAt: options.deletedAt ?? null,
  }).returning();
  await db.insert(schema.chunks).values(texts.map((content, chunkIndex) => ({
    userId, fileId: file!.id, chunkIndex, content, embedding: embedding(options.vector ?? 1), embedModel: options.embedModel ?? 'bge-m3',
  })));
  return file!.id;
}

describe.skipIf(skipDb)('recherche dans les documents', () => {
  it("refuse une recherche faite avec un autre modèle d'embeddings que l'index", async () => {
    const userId = await createUser();
    await expect(semanticSearch(userId, { embedModel: 'nomic-embed-text', embedding: embedding(1), limit: 5 }))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('classe par similarité, se limite aux fichiers demandés et ignore la corbeille', async () => {
    const userId = await createUser();
    await indexedFile(userId, 'proche.txt', ['loyer'], { vector: 1 });
    const far = await indexedFile(userId, 'loin.txt', ['impôts'], { vector: -1 });
    await indexedFile(userId, 'corbeille.txt', ['loyer'], { vector: 1, deletedAt: new Date() });

    const { results } = await semanticSearch(userId, { embedModel: 'bge-m3', embedding: embedding(1), limit: 5 });
    expect(results.map((result) => result.fileName)).toEqual(['proche.txt', 'loin.txt']);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);

    const scoped = await semanticSearch(userId, { embedModel: 'bge-m3', embedding: embedding(1), limit: 5, fileIds: [far] });
    expect(scoped.results.map((result) => result.fileId)).toEqual([far]);
  });

  it('trouve une expression exacte sans interpréter les jokers SQL, avec un extrait', async () => {
    const userId = await createUser();
    await indexedFile(userId, 'facture.txt', ['Remise de 100% sur la facture n° 2026_04', 'Total à payer : 42 €']);
    await indexedFile(userId, 'autre.txt', ['Remise de 1000 sur la facture n° 2026-04']);

    const { results } = await exactSearch(userId, { query: '100%', limit: 10 });
    expect(results).toEqual([{ fileId: expect.any(String), fileName: 'facture.txt', snippet: 'Remise de 100% sur la facture n° 2026_04' }]);
    expect((await exactSearch(userId, { query: '2026_04', limit: 10 })).results).toHaveLength(1);
    expect((await exactSearch(userId, { query: 'TOTAL À', limit: 10 })).results).toHaveLength(1);
  });

  it("ne cherche jamais dans les documents d'un autre utilisateur", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await indexedFile(alice, 'secret.txt', ['Code de la porte : 1234']);
    expect((await exactSearch(bob, { query: 'Code de la porte', limit: 10 })).results).toEqual([]);
    expect((await semanticSearch(bob, { embedModel: 'bge-m3', embedding: embedding(1), limit: 10 })).results).toEqual([]);
  });
});

const notifyStep = { type: 'notify' as const, text: 'Bonne nuit', label: 'Notification' };

describe.skipIf(skipDb)('tags NFC : gestion', () => {
  it("modifie un tag et l'associe à une routine, uniquement les siens", async () => {
    const userId = await createUser();
    const intruder = await createUser();
    const routine = await createRoutine(userId, { name: 'Bonne nuit', icon: 'moon', enabled: true, schedule: null, steps: [notifyStep] });
    const tag = await tags.createTag(userId, { name: 'Chevet', icon: 'bed', routineId: null });

    const updated = await tags.updateTag(userId, tag.id, { name: 'Table de nuit', routineId: routine.id });
    expect(updated).toMatchObject({ name: 'Table de nuit', icon: 'bed', routineId: routine.id });
    expect((await tags.listTags(userId))[0]).toMatchObject({ routineName: 'Bonne nuit' });

    await expect(tags.updateTag(intruder, tag.id, { name: 'Piraté' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(tags.revokeTag(intruder, tag.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it("refuse d'associer la routine d'un autre utilisateur", async () => {
    const userId = await createUser();
    const other = await createUser();
    const foreign = await createRoutine(other, { name: 'Autre', icon: 'sun', enabled: true, schedule: null, steps: [notifyStep] });
    await expect(tags.createTag(userId, { name: 'Entrée', icon: 'house', routineId: foreign.id })).rejects.toMatchObject({ code: 'not_found' });
    const tag = await tags.createTag(userId, { name: 'Entrée', icon: 'house', routineId: null });
    await expect(tags.updateTag(userId, tag.id, { routineId: foreign.id })).rejects.toMatchObject({ code: 'not_found' });
  });

  it("présente le tag et sa routine avant de la lancer, et un tag sans routine ne lance rien", async () => {
    const userId = await createUser();
    const routine = await createRoutine(userId, { name: 'Bonne nuit', icon: 'moon', enabled: true, schedule: null, steps: [notifyStep] });
    const withRoutine = await tags.createTag(userId, { name: 'Chevet', icon: 'bed', routineId: routine.id });
    const empty = await tags.createTag(userId, { name: 'Vide', icon: 'house', routineId: null });

    expect(await tags.previewTag(userId, withRoutine.publicId)).toMatchObject({ tag: { name: 'Chevet', routineName: 'Bonne nuit' }, routine: { id: routine.id } });
    expect(await tags.previewTag(userId, empty.publicId)).toMatchObject({ tag: { routineName: null }, routine: null });
    expect(await tags.scanTag(userId, empty.publicId)).toEqual({ run: null });
    expect((await tags.listTags(userId)).find((tag) => tag.id === empty.id)).toMatchObject({ scanCount: 1, lastScanAt: expect.any(String) });
    await expect(tags.previewTag(await createUser(), withRoutine.publicId)).rejects.toMatchObject({ code: 'not_found' });
  });
});

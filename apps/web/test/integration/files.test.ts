import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_STORAGE_BYTES_PER_USER } from '@app/shared';
import { and, count, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { createUser, embedding, sampleAnalysis, skipDb, textStream } from './helpers';

vi.mock('../../server/services/tasks', () => ({
  enqueueTask: vi.fn(async () => 'job'),
  cancelTasksFor: vi.fn(),
}));

const files = await import('../../server/services/files');
const { semanticSearch } = await import('../../server/services/search');

/** Simule un drive déjà rempli de `bytes` octets (sans écrire 500 Mo sur le disque). */
async function occupy(userId: string, bytes: number) {
  const id = randomUUID();
  await db.insert(schema.files).values({ id, userId, name: 'existant.pdf', mimeType: 'application/pdf', sizeBytes: bytes, storageKey: id });
}

describe.skipIf(skipDb)('drive : quota de stockage et isolation', () => {
  it('compte le stockage utilisé, sans limite de nombre de fichiers', async () => {
    const userId = await createUser();
    for (let index = 0; index < 20; index++) {
      await files.uploadFile(userId, { fileName: `note-${index}.txt`, stream: textStream('12345') });
    }
    expect(await files.getQuota(userId)).toEqual({ usedBytes: 100, maxBytes: MAX_STORAGE_BYTES_PER_USER });
  });

  it('refuse un fichier qui dépasse la place restante, avec un message clair', async () => {
    const userId = await createUser();
    await occupy(userId, MAX_STORAGE_BYTES_PER_USER - 10);
    await expect(files.uploadFile(userId, { fileName: 'trop.txt', stream: textStream('onze octets') }))
      .rejects.toMatchObject({ code: 'quota_exceeded', message: expect.stringContaining('Supprimez des fichiers') });
    await files.uploadFile(userId, { fileName: 'ok.txt', stream: textStream('dix octets') });
    expect((await files.getQuota(userId)).usedBytes).toBe(MAX_STORAGE_BYTES_PER_USER);
  });

  it('refuse avant réception si la taille annoncée dépasse la place restante', async () => {
    const userId = await createUser();
    await occupy(userId, MAX_STORAGE_BYTES_PER_USER - 1000);
    await expect(files.uploadFile(userId, { fileName: 'gros.txt', stream: textStream('x'), declaredBytes: 5000 }))
      .rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('ne dépasse pas le quota avec deux envois simultanés', async () => {
    const userId = await createUser();
    await occupy(userId, MAX_STORAGE_BYTES_PER_USER - 15);

    const results = await Promise.allSettled([
      files.uploadFile(userId, { fileName: 'a.txt', stream: textStream('dix octets') }),
      files.uploadFile(userId, { fileName: 'b.txt', stream: textStream('dix octets') }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'quota_exceeded' } });
    expect((await files.getQuota(userId)).usedBytes).toBe(MAX_STORAGE_BYTES_PER_USER - 5);
  });

  it('libère la place à la suppression', async () => {
    const userId = await createUser();
    const file = await files.uploadFile(userId, { fileName: 'a.txt', stream: textStream('dix octets') });
    await files.deleteFile(userId, file.id);
    expect((await files.getQuota(userId)).usedBytes).toBe(0);
  });

  it("n'expose jamais les fichiers d'un autre utilisateur", async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const file = await files.uploadFile(alice, { fileName: 'secret.txt', stream: textStream('Code : 1234') });

    expect(await files.listFiles(bob)).toEqual([]);
    await expect(files.getFile(bob, file.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(files.deleteFile(bob, file.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(files.readFileText(bob, file.id, { offset: 0, length: 100 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(files.saveFileIndex(bob, file.id, { embedModel: 'bge-m3', text: 'x', chunks: [], analysis: sampleAnalysis }))
      .rejects.toMatchObject({ code: 'not_found' });

    await files.saveFileIndex(alice, file.id, {
      embedModel: 'bge-m3',
      text: 'Code : 1234',
      chunks: [{ index: 0, content: 'Code : 1234', embedding: embedding(1) }],
      analysis: sampleAnalysis,
    });
    const search = { embedModel: 'bge-m3', embedding: embedding(1), limit: 5 };
    expect((await semanticSearch(bob, search)).results).toEqual([]);
    expect((await semanticSearch(alice, search)).results).toHaveLength(1);
  });
});

describe.skipIf(skipDb)('indexation', () => {
  it('remplace les chunks au lieu de les dupliquer quand une tâche est reprise', async () => {
    const userId = await createUser();
    const file = await files.uploadFile(userId, { fileName: 'doc.md', stream: textStream('# Doc') });
    const index = (texts: string[]) => files.saveFileIndex(userId, file.id, {
      embedModel: 'bge-m3',
      text: texts.join('\n\n'),
      chunks: texts.map((content, position) => ({ index: position, content, embedding: embedding(position) })),
      analysis: sampleAnalysis,
    });

    await index(['un', 'deux', 'trois']);
    await index(['un', 'deux']);

    const [row] = await db.select({ value: count() }).from(schema.chunks).where(eq(schema.chunks.fileId, file.id));
    expect(row?.value).toBe(2);
    expect((await files.getFile(userId, file.id)).status).toBe('ready');
  });

  it("refuse des embeddings d'un autre modèle", async () => {
    const userId = await createUser();
    const file = await files.uploadFile(userId, { fileName: 'doc.txt', stream: textStream('Texte') });
    await expect(files.saveFileIndex(userId, file.id, {
      embedModel: 'nomic-embed-text', text: 'Texte', chunks: [], analysis: sampleAnalysis,
    })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('supprime chunks, embeddings et fichier stocké avec le fichier', async () => {
    const userId = await createUser();
    const file = await files.uploadFile(userId, { fileName: 'doc.txt', stream: textStream('Texte') });
    await files.saveFileIndex(userId, file.id, {
      embedModel: 'bge-m3', text: 'Texte', chunks: [{ index: 0, content: 'Texte', embedding: embedding(1) }], analysis: sampleAnalysis,
    });
    const storedPath = join(resolve(process.env.STORAGE_DIR!), file.id);
    expect(existsSync(storedPath)).toBe(true);

    await files.deleteFile(userId, file.id);

    const [row] = await db.select({ value: count() }).from(schema.chunks)
      .where(and(eq(schema.chunks.fileId, file.id), eq(schema.chunks.userId, userId)));
    expect(row?.value).toBe(0);
    expect(existsSync(storedPath)).toBe(false);
  });
});

describe.skipIf(skipDb)('lecture du texte extrait', () => {
  it('renvoie la tranche demandée et la longueur totale', async () => {
    const userId = await createUser();
    const file = await files.uploadFile(userId, { fileName: 'long.txt', stream: textStream('ignoré') });
    await files.saveFileIndex(userId, file.id, { embedModel: 'bge-m3', text: 'abcdefghij', chunks: [], analysis: sampleAnalysis });
    await expect(files.readFileText(userId, file.id, { offset: 3, length: 4 }))
      .resolves.toMatchObject({ text: 'defg', offset: 3, totalLength: 10 });
  });
});

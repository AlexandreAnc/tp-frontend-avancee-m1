import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, schema } from '../../server/db';
import { createUser, skipDb, textStream } from './helpers';

vi.mock('../../server/services/tasks', () => ({
  enqueueTask: vi.fn(async () => 'job'),
  cancelTasksFor: vi.fn(),
}));

const drive = await import('../../server/services/drive');
const files = await import('../../server/services/files');
const { executeAction, undoAction } = await import('../../server/connectors/registry');
const trash = await import('../../server/services/trash');

const upload = (userId: string, fileName: string, folderId: string | null = null) =>
  files.uploadFile(userId, { fileName, stream: textStream('contenu'), folderId });

describe.skipIf(skipDb)('drive : dossiers', () => {
  it('crée une arborescence et la parcourt avec fil d’Ariane et totaux', async () => {
    const userId = await createUser();
    const logement = await drive.createFolder(userId, { name: 'Logement', parentId: null });
    const bail = await drive.createFolder(userId, { name: 'Bail 2026', parentId: logement.id });
    await upload(userId, 'quittance.txt', logement.id);
    await upload(userId, 'bail.txt', bail.id);
    await upload(userId, 'racine.txt');

    const root = await drive.browse(userId, { folderId: null });
    expect(root.files.map((file) => file.name)).toEqual(['racine.txt']);
    expect(root.folders).toEqual([expect.objectContaining({ name: 'Logement', fileCount: 2, sizeBytes: 14 })]);

    const inside = await drive.browse(userId, { folderId: bail.id });
    expect(inside.path.map((folder) => folder.name)).toEqual(['Logement', 'Bail 2026']);
    expect(inside.files.map((file) => file.name)).toEqual(['bail.txt']);
  });

  it('cherche dans tout le drive et renvoie le chemin de chaque fichier', async () => {
    const userId = await createUser();
    const logement = await drive.createFolder(userId, { name: 'Logement', parentId: null });
    await upload(userId, 'quittance-mars.txt', logement.id);
    await upload(userId, 'facture.txt');

    const result = await drive.browse(userId, { folderId: null, query: 'quittance' });
    expect(result.view).toBe('search');
    expect(result.files).toEqual([expect.objectContaining({ name: 'quittance-mars.txt', path: 'Logement' })]);
  });

  it('refuse deux dossiers de même nom au même niveau (sans tenir compte de la casse)', async () => {
    const userId = await createUser();
    await drive.createFolder(userId, { name: 'Impôts', parentId: null });
    await expect(drive.createFolder(userId, { name: 'impots', parentId: null })).rejects.toMatchObject({ code: 'conflict' });
    const other = await drive.createFolder(userId, { name: 'Banque', parentId: null });
    await expect(drive.updateFolder(userId, other.id, { name: 'IMPÔTS' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('empêche de déplacer un dossier dans lui-même ou un de ses sous-dossiers', async () => {
    const userId = await createUser();
    const parent = await drive.createFolder(userId, { name: 'A', parentId: null });
    const child = await drive.createFolder(userId, { name: 'B', parentId: parent.id });
    await expect(drive.updateFolder(userId, parent.id, { parentId: child.id })).rejects.toMatchObject({ code: 'validation' });
    await expect(drive.updateFolder(userId, parent.id, { parentId: parent.id })).rejects.toMatchObject({ code: 'validation' });
  });

  it('supprime un dossier en gardant son contenu, qui remonte d’un niveau', async () => {
    const userId = await createUser();
    const parent = await drive.createFolder(userId, { name: 'Parent', parentId: null });
    const folder = await drive.createFolder(userId, { name: 'À vider', parentId: parent.id });
    const sub = await drive.createFolder(userId, { name: 'Sous-dossier', parentId: folder.id });
    const file = await upload(userId, 'garde.txt', folder.id);

    expect(await drive.deleteFolder(userId, folder.id, 'keep')).toEqual({ trashedFiles: 0 });
    expect((await files.getFile(userId, file.id)).folderId).toBe(parent.id);
    const [moved] = await db.select().from(schema.folders).where(eq(schema.folders.id, sub.id));
    expect(moved?.parentId).toBe(parent.id);
  });

  it('supprime un dossier : ses fichiers, sous-dossiers compris, partent à la corbeille', async () => {
    const userId = await createUser();
    const folder = await drive.createFolder(userId, { name: 'Archives', parentId: null });
    const sub = await drive.createFolder(userId, { name: '2019', parentId: folder.id });
    await upload(userId, 'a.txt', folder.id);
    await upload(userId, 'b.txt', sub.id);
    const kept = await upload(userId, 'c.txt');

    expect(await drive.deleteFolder(userId, folder.id, 'all')).toEqual({ trashedFiles: 2 });
    expect((await files.listFiles(userId)).map((item) => item.id)).toEqual([kept.id]);
    expect(await drive.listFolderTree(userId)).toEqual([]);
    expect((await trash.listTrash(userId)).map((item) => [item.name, item.path]).sort()).toEqual([['a.txt', 'Archives'], ['b.txt', 'Archives / 2019']]);
  });

  it('isole les dossiers et fichiers entre utilisateurs', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const aliceFolder = await drive.createFolder(alice, { name: 'Privé', parentId: null });
    const bobFile = await upload(bob, 'bob.txt');

    await expect(drive.browse(bob, { folderId: aliceFolder.id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(drive.moveFiles(bob, [bobFile.id], aliceFolder.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(drive.moveFiles(alice, [bobFile.id], aliceFolder.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(upload(bob, 'intrus.txt', aliceFolder.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(drive.createFolder(bob, { name: 'X', parentId: aliceFolder.id })).rejects.toMatchObject({ code: 'not_found' });
    expect((await files.getFile(bob, bobFile.id)).folderId).toBeNull();
  });

  it('refuse un dossier inexistant à l’envoi', async () => {
    const userId = await createUser();
    await expect(upload(userId, 'perdu.txt', randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('crée un chemin à la demande et réutilise les dossiers existants', async () => {
    const userId = await createUser();
    const first = await drive.ensureFolderPath(userId, 'Logement / 2026');
    const second = await drive.ensureFolderPath(userId, 'logement/2026');
    expect(second).toBe(first);
    expect((await drive.listFolderTree(userId)).map((folder) => folder.name).sort()).toEqual(['2026', 'Logement']);
    expect(await drive.ensureFolderPath(userId, '')).toBeNull();
  });

  it('action « drive.move_file » de l’agent : range le fichier, puis annulation', async () => {
    const userId = await createUser();
    const file = await upload(userId, 'impots.txt');

    const result = await executeAction(userId, { type: 'drive.move_file', payload: { fileId: file.id, folderPath: 'Impôts/2026' } });
    const tree = await drive.listFolderTree(userId);
    const target = drive.pathOf(tree, (await files.getFile(userId, file.id)).folderId).map((folder) => folder.name);
    expect(target).toEqual(['Impôts', '2026']);

    await undoAction(userId, 'drive.move_file', result);
    expect((await files.getFile(userId, file.id)).folderId).toBeNull();
  });

  it('garantit en base des noms uniques, même avec des créations simultanées', async () => {
    const userId = await createUser();
    const results = await Promise.allSettled([
      drive.createFolder(userId, { name: 'Santé', parentId: null }),
      drive.createFolder(userId, { name: 'sante', parentId: null }),
      drive.ensureFolderPath(userId, 'SANTÉ'),
    ]);
    expect(await drive.listFolderTree(userId)).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: 'conflict' }) })]);
  });

  it('vues Favoris et Récents', async () => {
    const userId = await createUser();
    const folder = await drive.createFolder(userId, { name: 'Projets', parentId: null });
    const file = await upload(userId, 'plan.txt', folder.id);
    await upload(userId, 'autre.txt');
    await drive.updateFolder(userId, folder.id, { starred: true });
    await drive.updateFileMeta(userId, file.id, { starred: true });

    const starred = await drive.browse(userId, { folderId: null, view: 'starred' });
    expect(starred.folders.map((item) => item.name)).toEqual(['Projets']);
    expect(starred.files.map((item) => item.name)).toEqual(['plan.txt']);
    const recent = await drive.browse(userId, { folderId: null, view: 'recent' });
    expect(recent.files.map((item) => item.name)).toEqual(['autre.txt', 'plan.txt']);
  });
});

describe.skipIf(skipDb)('drive : corbeille', () => {
  it('met à la corbeille, masque partout, puis restaure dans le dossier d’origine', async () => {
    const userId = await createUser();
    const folder = await drive.createFolder(userId, { name: 'Banque', parentId: null });
    const file = await upload(userId, 'releve.txt', folder.id);

    await trash.trashFiles(userId, [file.id]);
    expect(await files.listFiles(userId)).toEqual([]);
    await expect(files.getFile(userId, file.id)).rejects.toMatchObject({ code: 'not_found' });
    expect((await drive.browse(userId, { folderId: folder.id })).files).toEqual([]);
    // La corbeille compte dans le quota tant qu'elle n'est pas vidée.
    expect((await files.getQuota(userId)).usedBytes).toBe(7);

    await trash.restoreFiles(userId, [file.id]);
    expect((await files.getFile(userId, file.id)).folderId).toBe(folder.id);
  });

  it('recrée le dossier d’origine à la restauration s’il a été supprimé', async () => {
    const userId = await createUser();
    const parent = await drive.createFolder(userId, { name: 'Impôts', parentId: null });
    const child = await drive.createFolder(userId, { name: '2025', parentId: parent.id });
    const file = await upload(userId, 'avis.txt', child.id);
    await drive.deleteFolder(userId, parent.id, 'all');

    await trash.restoreFiles(userId, [file.id]);
    const tree = await drive.listFolderTree(userId);
    expect(drive.pathLabel(tree, (await files.getFile(userId, file.id)).folderId)).toBe('Impôts / 2025');
  });

  it('suppression définitive et purge automatique après 30 jours', async () => {
    const userId = await createUser();
    const old = await upload(userId, 'ancien.txt');
    const recent = await upload(userId, 'recent.txt');
    const gone = await upload(userId, 'jete.txt');
    await trash.trashFiles(userId, [old.id, recent.id, gone.id]);
    await db.update(schema.files).set({ deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }).where(eq(schema.files.id, old.id));

    await trash.deleteForever(userId, [gone.id]);
    await trash.purgeExpiredTrash();
    expect((await trash.listTrash(userId)).map((item) => item.name)).toEqual(['recent.txt']);
    expect((await files.getQuota(userId)).usedBytes).toBe(7);
  });

  it('isole la corbeille entre utilisateurs', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const file = await upload(alice, 'a.txt');
    await expect(trash.trashFiles(bob, [file.id])).rejects.toMatchObject({ code: 'not_found' });
    await trash.trashFiles(alice, [file.id]);
    await expect(trash.restoreFiles(bob, [file.id])).rejects.toMatchObject({ code: 'not_found' });
    await expect(trash.deleteForever(bob, [file.id])).rejects.toMatchObject({ code: 'not_found' });
    expect(await trash.listTrash(bob)).toEqual([]);
  });
});

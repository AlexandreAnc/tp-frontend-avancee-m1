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
    expect(result.search).toBe(true);
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

    expect(await drive.deleteFolder(userId, folder.id, 'keep')).toEqual({ deletedFiles: 0 });
    expect((await files.getFile(userId, file.id)).folderId).toBe(parent.id);
    const [moved] = await db.select().from(schema.folders).where(eq(schema.folders.id, sub.id));
    expect(moved?.parentId).toBe(parent.id);
  });

  it('supprime un dossier et tous les fichiers de ses sous-dossiers', async () => {
    const userId = await createUser();
    const folder = await drive.createFolder(userId, { name: 'Archives', parentId: null });
    const sub = await drive.createFolder(userId, { name: '2019', parentId: folder.id });
    await upload(userId, 'a.txt', folder.id);
    await upload(userId, 'b.txt', sub.id);
    const kept = await upload(userId, 'c.txt');

    expect(await drive.deleteFolder(userId, folder.id, 'all')).toEqual({ deletedFiles: 2 });
    expect((await files.listFiles(userId)).map((item) => item.id)).toEqual([kept.id]);
    expect(await drive.listFolderTree(userId)).toEqual([]);
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
});

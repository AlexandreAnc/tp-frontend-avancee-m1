import { buffer } from 'node:stream/consumers';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { createUser, embedding, sampleAnalysis, skipDb, textStream } from './helpers';

vi.mock('../../server/services/tasks', () => ({
  enqueueTask: vi.fn(async () => 'job'),
  cancelTasksFor: vi.fn(),
}));

const drive = await import('../../server/services/drive');
const files = await import('../../server/services/files');
const trash = await import('../../server/services/trash');
const share = await import('../../server/services/share');
const { zipFolder } = await import('../../server/services/zip');
const { autoFileDocument } = await import('../../server/services/auto-file');
const { updateSettings } = await import('../../server/services/settings');
const { listActivity } = await import('../../server/services/activity');

const upload = (userId: string, fileName: string, folderId: string | null = null, content = 'contenu') =>
  files.uploadFile(userId, { fileName, stream: textStream(content), folderId });

async function index(userId: string, fileId: string, text: string, analysis: typeof sampleAnalysis & { category?: 'Factures' } = sampleAnalysis) {
  await files.saveFileIndex(userId, fileId, {
    embedModel: 'bge-m3',
    text,
    chunks: [{ index: 0, content: text, embedding: embedding(1) }],
    analysis,
  });
}

describe.skipIf(skipDb)('drive : recherche dans le contenu', () => {
  it('trouve un document par son contenu (racinisation française) avec un extrait', async () => {
    const userId = await createUser();
    const folder = await drive.createFolder(userId, { name: 'Logement', parentId: null });
    const file = await upload(userId, 'scan-0042.pdf.txt', folder.id);
    await index(userId, file.id, 'Le montant du loyer mensuel est fixé à 850 euros, charges comprises.');
    await index(userId, (await upload(userId, 'autre.txt')).id, 'Rien à voir ici.');

    const result = await drive.browse(userId, { folderId: null, query: 'loyers' });
    expect(result.files).toEqual([expect.objectContaining({ name: 'scan-0042.pdf.txt', path: 'Logement' })]);
    expect(result.files[0]!.snippet).toContain('\u0001loyer\u0002');
  });

  it('n’affiche ni les fichiers des autres ni ceux de la corbeille', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const file = await upload(alice, 'contrat.txt');
    await index(alice, file.id, 'Contrat d’assurance habitation.');
    expect((await drive.browse(bob, { folderId: null, query: 'assurance' })).files).toEqual([]);
    await trash.trashFiles(alice, [file.id]);
    expect((await drive.browse(alice, { folderId: null, query: 'assurance' })).files).toEqual([]);
  });
});

describe.skipIf(skipDb)('drive : liens de partage', () => {
  it('donne accès au fichier avec le jeton, jusqu’à révocation', async () => {
    const userId = await createUser();
    const file = await upload(userId, 'quittance.txt', null, 'Quittance de mars');
    const { token, link } = await share.createShareLink(userId, file.id, 24);

    expect(await share.describeShareLink(token)).toMatchObject({ name: 'quittance.txt', sizeBytes: 17 });
    const opened = await share.openSharedFile(token);
    expect((await buffer(opened.stream)).toString()).toBe('Quittance de mars');
    expect((await share.listShareLinks(userId, file.id))[0]).toMatchObject({ id: link.id, downloadCount: 1 });

    await share.revokeShareLink(userId, link.id);
    await expect(share.describeShareLink(token)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuse un jeton inconnu, expiré, ou d’un fichier mis à la corbeille', async () => {
    const userId = await createUser();
    const file = await upload(userId, 'a.txt');
    await expect(share.describeShareLink('x'.repeat(43))).rejects.toMatchObject({ code: 'not_found' });
    await expect(share.describeShareLink('../../etc/passwd')).rejects.toMatchObject({ code: 'not_found' });

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { token } = await share.createShareLink(userId, file.id, 1);
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
      await expect(share.describeShareLink(token)).rejects.toMatchObject({ code: 'not_found' });
    } finally {
      vi.useRealTimers();
    }

    const { token } = await share.createShareLink(userId, file.id, 24);
    await trash.trashFiles(userId, [file.id]);
    await expect(share.describeShareLink(token)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('ne permet pas de partager ni révoquer les fichiers d’un autre', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const file = await upload(alice, 'a.txt');
    await expect(share.createShareLink(bob, file.id, 24)).rejects.toMatchObject({ code: 'not_found' });
    const { link } = await share.createShareLink(alice, file.id, 24);
    await expect(share.revokeShareLink(bob, link.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe.skipIf(skipDb)('drive : archive .zip', () => {
  it('reprend l’arborescence du dossier, sans les fichiers à la corbeille', async () => {
    const userId = await createUser();
    const root = await drive.createFolder(userId, { name: 'Voiture', parentId: null });
    const sub = await drive.createFolder(userId, { name: 'Entretien', parentId: root.id });
    await drive.createFolder(userId, { name: 'Vide', parentId: root.id });
    await upload(userId, 'carte-grise.txt', root.id, 'CG');
    await upload(userId, 'revision.txt', sub.id, 'R1');
    await upload(userId, 'revision.txt', sub.id, 'R2');
    const trashed = await upload(userId, 'vieux.txt', root.id);
    await trash.trashFiles(userId, [trashed.id]);

    const { name, stream } = await zipFolder(userId, root.id);
    const entries = unzipSync(new Uint8Array(await buffer(stream)));
    expect(name).toBe('Voiture.zip');
    expect(Object.keys(entries).sort()).toEqual(['Entretien/revision (2).txt', 'Entretien/revision.txt', 'Vide/', 'carte-grise.txt']);
    expect(strFromU8(entries['carte-grise.txt']!)).toBe('CG');
  });

  it('refuse le dossier d’un autre utilisateur', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const folder = await drive.createFolder(alice, { name: 'Privé', parentId: null });
    await expect(zipFolder(bob, folder.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe.skipIf(skipDb)('drive : rangement automatique', () => {
  it('range le document analysé dans le dossier de sa catégorie, si le réglage est activé', async () => {
    const userId = await createUser();
    const file = await upload(userId, 'edf.txt');
    await index(userId, file.id, 'Facture EDF', { ...sampleAnalysis, category: 'Factures' });

    await autoFileDocument(userId, file.id);
    expect((await files.getFile(userId, file.id)).folderId).toBeNull();

    await updateSettings(userId, { autoFileDocuments: true });
    await autoFileDocument(userId, file.id);
    const stored = await files.getFile(userId, file.id);
    expect(drive.pathLabel(await drive.listFolderTree(userId), stored.folderId)).toBe('Factures');
    expect(stored.category).toBe('Factures');
    expect((await listActivity(userId))[0]).toMatchObject({ type: 'drive.move_file', status: 'executed', undoable: true });
  });

  it('ne touche pas à un fichier que l’utilisateur a déjà rangé', async () => {
    const userId = await createUser();
    await updateSettings(userId, { autoFileDocuments: true });
    const folder = await drive.createFolder(userId, { name: 'Perso', parentId: null });
    const file = await upload(userId, 'edf.txt', folder.id);
    await index(userId, file.id, 'Facture EDF', { ...sampleAnalysis, category: 'Factures' });
    await autoFileDocument(userId, file.id);
    expect((await files.getFile(userId, file.id)).folderId).toBe(folder.id);
  });
});

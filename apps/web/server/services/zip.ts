import { once } from 'node:events';
import { PassThrough, type Readable } from 'node:stream';
import { formatBytes, MAX_ZIP_BYTES } from '@app/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Zip, ZipPassThrough } from 'fflate';
import { db, schema } from '../db';
import { AppError, notFound } from '../utils/errors';
import { descendantsOf, listFolderTree, pathOf } from './drive';
import { activeFile } from './files';
import { openStoredFile } from './storage';

const { files } = schema;

/** « facture.pdf » déjà pris dans le même dossier → « facture (2).pdf ». */
function uniquePath(taken: Set<string>, path: string): string {
  let candidate = path;
  for (let index = 2; taken.has(candidate.toLowerCase()); index++) {
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    candidate = dot > slash + 1 ? `${path.slice(0, dot)} (${index})${path.slice(dot)}` : `${path} (${index})`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Archive .zip d'un dossier et de ses sous-dossiers (`null` : tout le drive), produite en flux :
 * rien n'est chargé entièrement en mémoire. Les fichiers sont stockés sans recompression
 * (PDF, images et documents Office sont déjà compressés).
 */
export async function zipFolder(userId: string, folderId: string | null): Promise<{ name: string; stream: Readable }> {
  const tree = await listFolderTree(userId);
  const root = folderId ? tree.find((folder) => folder.id === folderId) : null;
  if (folderId && !root) throw notFound('Dossier');
  const scope = root ? descendantsOf(tree, root.id) : null;

  const rows = await db.select({ id: files.id, name: files.name, folderId: files.folderId, sizeBytes: files.sizeBytes, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.userId, userId), activeFile, scope ? inArray(files.folderId, [...scope]) : undefined));
  const total = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  if (total > MAX_ZIP_BYTES) {
    throw new AppError('validation', `Dossier trop volumineux pour une archive (${formatBytes(total)}, ${formatBytes(MAX_ZIP_BYTES)} max).`);
  }

  // Chemin relatif au dossier téléchargé.
  const depth = root ? pathOf(tree, root.id).length : 0;
  const relative = (id: string | null) => pathOf(tree, id).slice(depth).map((folder) => folder.name).join('/');
  const taken = new Set<string>();
  const entries = rows.map((row) => {
    const dir = row.folderId ? relative(row.folderId) : '';
    return { ...row, path: uniquePath(taken, dir ? `${dir}/${row.name}` : row.name) };
  });
  const usedDirs = new Set(entries.map((entry) => entry.path.split('/').slice(0, -1).join('/')));
  const emptyDirs = [...(scope ?? tree.map((folder) => folder.id))]
    .map((id) => relative(id))
    .filter((dir) => dir && ![...usedDirs].some((used) => used === dir || used.startsWith(`${dir}/`)));

  const output = new PassThrough();
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      output.destroy(error);
      return;
    }
    output.write(chunk);
    if (final) output.end();
  });

  void (async () => {
    for (const dir of emptyDirs) {
      const entry = new ZipPassThrough(`${dir}/`);
      zip.add(entry);
      entry.push(new Uint8Array(0), true);
    }
    for (const file of entries) {
      const entry = new ZipPassThrough(file.path);
      zip.add(entry);
      for await (const chunk of openStoredFile(file.storageKey)) {
        entry.push(chunk as Uint8Array);
        // Respecte le rythme du client : on attend qu'il ait lu avant de continuer.
        if (output.writableNeedDrain) await once(output, 'drain');
      }
      entry.push(new Uint8Array(0), true);
    }
    zip.end();
  })().catch((error: unknown) => output.destroy(error as Error));

  return { name: `${root?.name ?? 'Mon drive'}.zip`, stream: output };
}


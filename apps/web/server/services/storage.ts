import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { getEnv } from '../utils/env';

/**
 * Stockage des fichiers sur le disque du serveur (volume Docker en prod).
 * Les fichiers temporaires sont dans le même volume pour que `rename` reste atomique.
 */
function rootDir() {
  return resolve(getEnv().STORAGE_DIR);
}

function pathFor(storageKey: string) {
  if (!/^[\w-]+$/.test(storageKey)) {
    throw new Error(`Clé de stockage invalide : ${storageKey}`);
  }
  return join(rootDir(), storageKey);
}

export interface TempUpload {
  tempPath: string;
  sizeBytes: number;
}

/**
 * Écrit un flux dans un fichier temporaire en comptant les octets au fil de l'eau.
 * Le transfert est coupé dès que `maxBytes` est dépassé : le fichier n'est jamais chargé en mémoire.
 */
export async function writeStreamToTemp(stream: Readable, maxBytes: number, tooLarge: Error): Promise<TempUpload> {
  const tempDir = join(rootDir(), 'tmp');
  await mkdir(tempDir, { recursive: true });
  const tempPath = join(tempDir, randomUUID());

  let sizeBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) {
        callback(tooLarge);
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(stream, limiter, createWriteStream(tempPath));
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return { tempPath, sizeBytes };
}

export async function commitTemp(tempPath: string, storageKey: string): Promise<void> {
  await mkdir(rootDir(), { recursive: true });
  await rename(tempPath, pathFor(storageKey));
}

export async function discardTemp(tempPath: string): Promise<void> {
  await rm(tempPath, { force: true });
}

export function openStoredFile(storageKey: string) {
  return createReadStream(pathFor(storageKey));
}

export async function removeStoredFile(storageKey: string): Promise<void> {
  await rm(pathFor(storageKey), { force: true });
}

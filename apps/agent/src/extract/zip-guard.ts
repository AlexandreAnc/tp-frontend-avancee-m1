import { inflateRawSync } from 'node:zlib';
import { TaskError } from '../tasks/errors';

/**
 * Garde contre les archives piégées (« zip bombs ») : un .docx ou .xlsx est une archive zip, et un fichier de
 * quelques Mo peut se décompresser en plusieurs Go. Les bibliothèques de lecture décompressent tout en mémoire :
 * l'agent plantait, la tâche était relancée, et la machine qui sert tous les comptes tombait à chaque essai.
 *
 * On décompresse donc chaque entrée nous-mêmes avec un plafond (`maxOutputLength`) avant de passer la main :
 * les tailles déclarées dans l'archive peuvent mentir, la taille réellement produite non.
 */

/** Taille décompressée maximale d'un document bureautique. Un .docx de 300 pages fait quelques Mo. */
export const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 5000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

function reject(reason: string): never {
  throw new TaskError(`Document refusé : ${reason}`, false);
}

/** Fin de l'annuaire central : dans les 22 + 65 535 derniers octets (commentaire d'archive compris). */
function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xffff); offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return reject('archive illisible');
}

export function assertSafeZip(buffer: Buffer, maxBytes = MAX_UNZIPPED_BYTES): void {
  if (buffer.length < 22) reject('archive illisible');
  const eocd = findEndOfCentralDirectory(buffer);
  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  // Zip64 (champs saturés) : inutile pour un document bureautique, et il permettrait de contourner les limites.
  if (entries === 0xffff || directoryOffset === 0xffffffff) reject('format zip64 non pris en charge');
  if (entries > MAX_ZIP_ENTRIES) reject('trop de fichiers dans l’archive');

  let remaining = maxBytes;
  let cursor = directoryOffset;
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) reject('archive illisible');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) reject('archive illisible');
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (data.length !== compressedSize) reject('archive tronquée');

    let size: number;
    if (method === STORED) {
      size = compressedSize;
    } else if (method === DEFLATED) {
      try {
        size = inflateRawSync(data, { maxOutputLength: remaining + 1 }).length;
      } catch (error) {
        if (error instanceof RangeError) reject('contenu décompressé trop volumineux');
        reject('archive corrompue');
      }
    } else {
      reject('méthode de compression non prise en charge');
    }
    remaining -= size;
    if (remaining < 0) reject('contenu décompressé trop volumineux');
  }
}

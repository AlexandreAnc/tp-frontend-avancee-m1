import { FILE_CATEGORIES } from '@app/shared';
import { z } from 'zod';
import { ensureFolderPath, moveFiles, updateFileMeta } from '../../services/drive';
import { getFile, setFileCategory, toFileDto } from '../../services/files';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam, readValidatedBodyOrThrow } from '../../utils/validation';

const bodySchema = z.object({
  category: z.enum(FILE_CATEGORIES).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  starred: z.boolean().optional(),
  folderId: z.uuid().nullable().optional(),
  /** Alternative à `folderId` : chemin créé au besoin (ex. « Classer dans « Logement » »). */
  folderPath: z.string().max(500).optional(),
});

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const fileId = getUuidParam(event);
  const input = await readValidatedBodyOrThrow(event, bodySchema);
  if (input.category !== undefined) await setFileCategory(user.id, fileId, input.category);
  if (input.name !== undefined || input.starred !== undefined) await updateFileMeta(user.id, fileId, { name: input.name, starred: input.starred });
  if (input.folderId !== undefined) await moveFiles(user.id, [fileId], input.folderId);
  if (input.folderPath !== undefined) await moveFiles(user.id, [fileId], await ensureFolderPath(user.id, input.folderPath));
  return { file: toFileDto(await getFile(user.id, fileId)) };
});

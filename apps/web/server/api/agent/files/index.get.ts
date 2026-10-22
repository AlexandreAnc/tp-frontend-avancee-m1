import { listFolderTree, pathOf } from '../../../services/drive';
import { listFiles } from '../../../services/files';
import { defineAppHandler } from '../../../utils/handler';
import { requireTaskToken } from '../../../utils/task-auth';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const [files, tree] = await Promise.all([listFiles(userId), listFolderTree(userId)]);
  return {
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: file.status,
      documentType: file.analysis?.documentType ?? null,
      summary: file.analysis?.summary ?? null,
      path: pathOf(tree, file.folderId).map((folder) => folder.name).join(' / '),
      createdAt: file.createdAt.toISOString(),
    })),
  };
});

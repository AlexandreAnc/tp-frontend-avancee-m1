import { runDirectAction } from './activity';
import { getFile, setFileCategory } from './files';
import { getSettings } from './settings';

/**
 * Rangement automatique (réglage « Ranger automatiquement ») : un document analysé, encore à la racine,
 * part dans le dossier de sa catégorie. Passe par le journal, donc annulable comme toute action directe.
 */
export async function autoFileDocument(userId: string, fileId: string): Promise<void> {
  const settings = await getSettings(userId);
  if (!settings.autoFileDocuments) return;
  const file = await getFile(userId, fileId);
  const category = file.analysis?.category;
  if (!category || file.folderId) return;

  if (!file.category) await setFileCategory(userId, fileId, category);
  await runDirectAction(userId, {
    action: { type: 'drive.move_file', payload: { fileId, folderPath: category } },
    summary: `${file.name} rangé dans « ${category} »`,
    trigger: 'agent',
  });
}

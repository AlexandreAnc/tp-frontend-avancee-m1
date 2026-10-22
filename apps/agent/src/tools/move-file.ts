import { defineAgentTool } from './types';

/** Rangement : action sans risque, exécutée directement et annulable depuis le journal. */
export const moveFileTool = defineAgentTool('move_file', async (input, { api }) => {
  const { files } = await api.listFiles();
  const name = files.find((file) => file.id === input.fileId)?.name ?? 'le fichier';
  const target = input.folderPath.trim() || 'la racine du drive';
  return api.requestAction({ type: 'drive.move_file', payload: input }, `Ranger « ${name} » dans ${target}`);
});

import { defineAgentTool } from './types';

export const activateSceneTool = defineAgentTool('activate_scene', async (input, { api }) => {
  const home = await api.getHome();
  const scene = home.scenes.find((candidate) => candidate.id === input.sceneId);
  return api.requestAction({ type: 'hue.activate_scene', payload: { sceneId: input.sceneId } }, `Scène « ${scene?.name ?? 'Hue'} »`);
});

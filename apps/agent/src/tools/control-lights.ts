import { defineAgentTool } from './types';

/** Action sans risque : exécutée directement par le serveur, annulable depuis le journal. */
export const controlLightsTool = defineAgentTool('control_lights', async (input, { api }) => {
  const home = await api.getHome();
  const room = input.roomId === 'all' ? null : home.rooms.find((candidate) => candidate.id === input.roomId);
  const target = input.roomId === 'all' ? 'toute la maison' : room?.name ?? 'la pièce';
  const verb = input.on === false ? 'Éteindre' : input.brightness ? `Régler à ${input.brightness} %` : 'Allumer';
  return api.requestAction(
    { type: 'hue.set_room', payload: { roomId: input.roomId, on: input.on, brightness: input.brightness } },
    `${verb} ${target}`,
  );
});

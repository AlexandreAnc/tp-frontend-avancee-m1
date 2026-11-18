import { defineAgentTool } from './types';

/** Action sans risque : exécutée directement par le serveur, annulable depuis le journal. */
export const controlLightsTool = defineAgentTool('control_lights', async (input, { api }) => {
  const target = input.roomId === 'all'
    ? 'toute la maison'
    : (await api.getHome()).rooms.find((room) => room.id === input.roomId)?.name ?? 'la pièce';
  const verb = input.on === false ? 'Éteindre' : input.brightness ? `Régler à ${input.brightness} %` : 'Allumer';
  return api.requestAction(
    { type: 'hue.set_room', payload: { roomId: input.roomId, on: input.on, brightness: input.brightness } },
    `${verb} ${target}`,
  );
});

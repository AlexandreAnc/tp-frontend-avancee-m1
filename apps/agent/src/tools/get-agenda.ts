import { localToZonedIso } from './time';
import { defineAgentTool } from './types';

/** Planning sur des jours entiers, bornés dans le fuseau de l'utilisateur. */
export const getAgendaTool = defineAgentTool('get_agenda', (input, { api, timezone }) => {
  const nextDay = new Date(`${input.to}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return api.getAgenda({
    from: localToZonedIso(`${input.from}T00:00`, timezone),
    to: localToZonedIso(`${nextDay.toISOString().slice(0, 10)}T00:00`, timezone),
  });
});

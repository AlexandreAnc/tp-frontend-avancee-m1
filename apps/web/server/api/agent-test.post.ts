import { pingAgent } from '../agent-gateway/gateway';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';

/** « Tester la connexion » : latence aller-retour jusqu'à l'agent local. */
export default defineAppHandler(async (event) => {
  await requireUser(event);
  return { ...await pingAgent(), testedAt: new Date().toISOString() };
});

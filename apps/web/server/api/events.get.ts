import { createEventStream } from 'h3';
import { getAgentStatus } from '../agent-gateway/gateway';
import { subscribe } from '../services/events';
import { defineAppHandler } from '../utils/handler';
import { requireUser } from '../utils/session';

const KEEP_ALIVE_MS = 25_000;

/** Flux SSE des événements de l'utilisateur (étapes de l'agent, statuts, actions). */
export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  const stream = createEventStream(event);

  const push = (data: unknown) => {
    stream.push(JSON.stringify(data)).catch(() => {});
  };
  const unsubscribe = subscribe(user.id, push);
  const keepAlive = setInterval(() => {
    stream.push({ event: 'ping', data: '' }).catch(() => {});
  }, KEEP_ALIVE_MS);

  stream.onClosed(async () => {
    clearInterval(keepAlive);
    unsubscribe();
    await stream.close();
  });

  push({ type: 'agent.status', ...getAgentStatus() });
  return stream.send();
});

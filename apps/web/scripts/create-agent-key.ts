/**
 * Crée une clé d'agent depuis le terminal (utile avant d'avoir un compte admin).
 * Usage : pnpm --filter web agent-key:create <nom-de-la-machine>
 */
import { createAgentKey } from '../server/services/agent-keys';
import { pool } from '../server/db';

const name = process.argv[2];
if (!name) {
  console.error('Usage : pnpm --filter web agent-key:create <nom-de-la-machine>');
  process.exit(1);
}

try {
  const { key, agentKey } = await createAgentKey(name);
  console.info(`Clé créée pour « ${agentKey.name} ». Copiez-la dans AGENT_KEY, elle ne sera plus affichée :\n\n${key}\n`);
} finally {
  await pool.end();
}

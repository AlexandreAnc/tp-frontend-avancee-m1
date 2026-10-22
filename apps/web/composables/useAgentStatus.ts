import type { AgentSummary } from '#shared/types/events';

/** L'agent local est-il connecté (et lequel) ? Mis à jour en direct par le flux d'événements. */
export function useAgentStatus() {
  const online = useState<boolean | null>('agent-online', () => null);
  const agent = useState<AgentSummary | null>('agent-summary', () => null);
  useEvents((event) => {
    if (event.type === 'agent.status') {
      online.value = event.online;
      agent.value = event.agent;
    }
  });
  return { online, agent };
}

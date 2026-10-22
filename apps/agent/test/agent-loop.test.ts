import { MAX_AGENT_ITERATIONS, type AgentStep } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { runAgentLoop } from '../src/loop/agent-loop';
import { TaskError } from '../src/tasks/errors';
import { fakeContext, fakeLlm } from './fakes';

const history = [{ role: 'user' as const, content: 'Combien je dois au plombier ?' }];
const searchCall = { tool_calls: [{ function: { name: 'exact_search', arguments: { query: 'plombier' } } }] };

function setup(replies: Parameters<typeof fakeLlm>[0], exactSearch: () => Promise<unknown>) {
  const { llm, chat } = fakeLlm(replies);
  const steps: AgentStep[] = [];
  const run = () => runAgentLoop({
    history,
    context: fakeContext({ exactSearch }, llm),
    emitStep: async (step) => void steps.push(step),
    signal: new AbortController().signal,
    now: new Date('2026-10-22T10:00:00Z'),
  });
  return { run, steps, chat };
}

describe('runAgentLoop', () => {
  it('enchaîne réflexion, outil puis réponse et publie chaque étape', async () => {
    const results = { results: [{ fileId: '849fea72-3abd-4321-9ff7-00a5d3ee67cf', fileName: 'facture.md', snippet: '340,50 EUR' }] };
    const { run, steps, chat } = setup([
      { thinking: 'Je cherche la facture.', ...searchCall },
      { content: 'Vous devez 340,50 EUR (facture.md).' },
    ], async () => results);

    await expect(run()).resolves.toBe('Vous devez 340,50 EUR (facture.md).');
    expect(steps.map((step) => step.kind)).toEqual(['thinking', 'tool_call', 'tool_result']);
    expect(steps[2]).toEqual({ kind: 'tool_result', tool: 'exact_search', output: results });
    const secondCall = chat.mock.calls[1] as unknown as [{ messages: { role: string; tool_name?: string }[] }];
    expect(secondCall[0].messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_name: 'exact_search' }));
  });

  it('renvoie au modèle une erreur d’outil non fatale', async () => {
    const { run, steps } = setup([searchCall, { content: 'Document introuvable.' }], async () => {
      throw new TaskError('API /search/exact : 404 Fichier introuvable', false, false);
    });
    await expect(run()).resolves.toBe('Document introuvable.');
    expect(steps[1]).toMatchObject({ kind: 'tool_result', error: expect.stringContaining('404') });
  });

  it('arrête la tâche sur une erreur fatale (token refusé)', async () => {
    const { run } = setup([searchCall], async () => {
      throw new TaskError('API /search/exact : 401 Token de tâche invalide', false, true);
    });
    await expect(run()).rejects.toThrow('401');
  });

  it("force une réponse après le nombre maximal d'itérations", async () => {
    const replies = Array.from({ length: MAX_AGENT_ITERATIONS }, () => searchCall);
    const { run, chat } = setup([...replies, { content: 'Réponse partielle.' }], async () => ({ results: [] }));
    await expect(run()).resolves.toBe('Réponse partielle.');
    expect(chat).toHaveBeenCalledTimes(MAX_AGENT_ITERATIONS + 1);
    const last = chat.mock.calls.at(-1) as unknown as [{ tools?: unknown }];
    expect(last[0].tools).toBeUndefined();
  });
});

import { MAX_AGENT_ITERATIONS, MAX_ORCHESTRATOR_ITERATIONS, SPECIALISTS, type AgentRole, type AgentStep } from '@app/shared';
import type { ChatResponse, Message } from 'ollama';
import { describe, expect, it, vi } from 'vitest';
import type { LlmClient } from '../src/llm/ollama';
import { runOrchestrator } from '../src/loop/orchestrator';
import { runSpecialist } from '../src/loop/specialist';
import { TaskError } from '../src/tasks/errors';
import { fakeContext } from './fakes';

type Replies = Partial<Record<AgentRole, Partial<Message>[]>>;

/** Modèle factice : chaque agent (reconnu à son prompt système) dépile ses propres réponses. */
function scriptedLlm(replies: Replies) {
  const queues = Object.fromEntries(Object.entries(replies).map(([role, list]) => [role, [...list]])) as Replies;
  const calls: { role: AgentRole; messages: Message[]; tools?: { function: { name: string } }[] }[] = [];
  const roleOf = (system: string): AgentRole =>
    (Object.keys(SPECIALISTS) as (keyof typeof SPECIALISTS)[]).find((name) => system.includes(`spécialiste ${SPECIALISTS[name].label} d'une équipe`)) ?? 'orchestrator';
  const chat = vi.fn(async (request: { messages: Message[]; tools?: { function: { name: string } }[] }) => {
    const role = roleOf(request.messages[0]!.content);
    calls.push({ role, messages: [...request.messages], tools: request.tools });
    // Laisse les spécialistes lancés en parallèle s'entrelacer.
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { message: { role: 'assistant', content: '', ...queues[role]?.shift() } } as ChatResponse;
  });
  const llm = { chat, supportsThinking: true } as unknown as LlmClient;
  return { llm, calls };
}

const call = (name: string, args: Record<string, unknown>) => ({ function: { name, arguments: args } });
const searchCall = { tool_calls: [call('exact_search', { query: 'plombier' })] };
const facture = { results: [{ fileId: '849fea72-3abd-4321-9ff7-00a5d3ee67cf', fileName: 'facture.md', snippet: '340,50 EUR' }] };

function collect() {
  const steps: AgentStep[] = [];
  return { steps, emitStep: async (step: AgentStep) => void steps.push(step) };
}

describe('runSpecialist', () => {
  function setup(replies: Partial<Message>[], api: Record<string, unknown>) {
    const { llm, calls } = scriptedLlm({ documents: replies });
    const { steps, emitStep } = collect();
    const run = () => runSpecialist({
      specialist: 'documents',
      task: 'Combien doit-il au plombier ?',
      parentId: 'orchestrator.0.0',
      context: fakeContext(api, llm),
      emitStep,
      signal: new AbortController().signal,
      now: new Date('2026-10-22T10:00:00Z'),
    });
    return { run, steps, calls };
  }

  it('enchaîne réflexion, outil puis compte rendu, étapes rattachées à la délégation', async () => {
    const { run, steps, calls } = setup([
      { thinking: 'Je cherche la facture.', ...searchCall },
      { content: '340,50 EUR (facture.md).' },
    ], { exactSearch: async () => facture });

    await expect(run()).resolves.toBe('340,50 EUR (facture.md).');
    expect(steps).toEqual([
      { kind: 'thinking', text: 'Je cherche la facture.', agent: 'documents', parentId: 'orchestrator.0.0' },
      { kind: 'tool_call', tool: 'exact_search', input: { query: 'plombier' }, callId: 'orchestrator.0.0.0.0', agent: 'documents', parentId: 'orchestrator.0.0' },
      { kind: 'tool_result', tool: 'exact_search', output: facture, callId: 'orchestrator.0.0.0.0', agent: 'documents', parentId: 'orchestrator.0.0' },
    ]);
    // Le spécialiste ne voit que ses outils.
    expect(calls[0]!.tools!.map((tool) => tool.function.name)).toEqual([...SPECIALISTS.documents.tools]);
    expect(calls[1]!.messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_name: 'exact_search' }));
  });

  it('refuse l’outil d’un autre spécialiste', async () => {
    const controlLights = vi.fn();
    const { run, steps } = setup([
      { tool_calls: [call('control_lights', { roomId: 'all', on: false })] },
      { content: 'Je ne peux pas agir sur les lumières.' },
    ], { requestAction: controlLights, getHome: controlLights });

    await expect(run()).resolves.toBe('Je ne peux pas agir sur les lumières.');
    expect(controlLights).not.toHaveBeenCalled();
    expect(steps[1]).toMatchObject({ kind: 'tool_result', error: 'Outil inconnu : control_lights' });
  });

  it('renvoie au modèle une erreur d’outil non fatale', async () => {
    const { run, steps } = setup([searchCall, { content: 'Document introuvable.' }], {
      exactSearch: async () => { throw new TaskError('API /search/exact : 404 Fichier introuvable', false, false); },
    });
    await expect(run()).resolves.toBe('Document introuvable.');
    expect(steps[1]).toMatchObject({ kind: 'tool_result', error: expect.stringContaining('404') });
  });

  it('arrête la tâche sur une erreur fatale (token refusé)', async () => {
    const { run } = setup([searchCall], {
      exactSearch: async () => { throw new TaskError('API /search/exact : 401 Token de tâche invalide', false, true); },
    });
    await expect(run()).rejects.toThrow('401');
  });

  it("force un compte rendu après le nombre maximal d'itérations", async () => {
    const replies = Array.from({ length: MAX_AGENT_ITERATIONS }, () => searchCall);
    const { run, calls } = setup([...replies, { content: 'Réponse partielle.' }], { exactSearch: async () => ({ results: [] }) });
    await expect(run()).resolves.toBe('Réponse partielle.');
    expect(calls).toHaveLength(MAX_AGENT_ITERATIONS + 1);
    expect(calls.at(-1)!.tools).toBeUndefined();
  });
});

describe('runOrchestrator', () => {
  function setup(replies: Replies, api: Record<string, unknown> = {}, content = 'Quoi de neuf ?') {
    const { llm, calls } = scriptedLlm(replies);
    const { steps, emitStep } = collect();
    const run = () => runOrchestrator({
      history: [{ role: 'user', content }],
      context: fakeContext(api, llm),
      emitStep,
      signal: new AbortController().signal,
      now: new Date('2026-10-22T10:00:00Z'),
    });
    return { run, steps, calls };
  }

  it('répond directement sans déléguer quand la demande ne touche pas aux données', async () => {
    const { run, steps, calls } = setup({ orchestrator: [{ content: 'Bonjour !' }] });
    await expect(run()).resolves.toBe('Bonjour !');
    expect(steps).toEqual([]);
    expect(calls[0]!.tools!.map((tool) => tool.function.name)).toEqual(['ask_documents', 'ask_planning', 'ask_home']);
  });

  it('délègue en parallèle puis synthétise les comptes rendus', async () => {
    const getAgenda = vi.fn(async () => ({ items: [], calendarConnected: true }));
    const { run, steps, calls } = setup({
      orchestrator: [
        { tool_calls: [call('ask_documents', { task: 'Montant dû au plombier ?' }), call('ask_planning', { task: 'Planning de la semaine du 2026-10-19' })] },
        { content: 'Vous devez 340,50 EUR (facture.md) et votre semaine est libre.' },
      ],
      documents: [searchCall, { content: '340,50 EUR, facture.md' }],
      planning: [{ tool_calls: [call('get_agenda', { from: '2026-10-19', to: '2026-10-25' })] }, { content: 'Aucun événement.' }],
    }, { exactSearch: async () => facture, getAgenda });

    await expect(run()).resolves.toBe('Vous devez 340,50 EUR (facture.md) et votre semaine est libre.');
    expect(getAgenda).toHaveBeenCalledOnce();

    // Les deux délégations démarrent avant qu'aucune ne se termine.
    const kinds = steps.filter((step) => step.agent === 'orchestrator').map((step) => step.kind);
    expect(kinds).toEqual(['delegation', 'delegation', 'delegation_result', 'delegation_result']);
    expect(steps.filter((step) => step.agent === 'documents').every((step) => step.parentId === 'orchestrator.0.0')).toBe(true);
    expect(steps.filter((step) => step.agent === 'planning').every((step) => step.parentId === 'orchestrator.0.1')).toBe(true);

    // La synthèse reçoit les comptes rendus dans l'ordre des appels.
    const synthesis = calls.filter((entry) => entry.role === 'orchestrator')[1]!;
    expect(synthesis.messages.filter((message) => message.role === 'tool').map((message) => message.content)).toEqual([
      JSON.stringify({ specialist: 'documents', answer: '340,50 EUR, facture.md' }),
      JSON.stringify({ specialist: 'planning', answer: 'Aucun événement.' }),
    ]);
  });

  it('enchaîne deux délégations dépendantes', async () => {
    const { run, calls } = setup({
      orchestrator: [
        { tool_calls: [call('ask_documents', { task: 'Date de fin du bail ?' })] },
        { tool_calls: [call('ask_planning', { task: 'Rappel le 2026-11-30T09:00 : préavis du bail' })] },
        { content: 'Rappel programmé.' },
      ],
      documents: [{ content: 'Fin du bail le 2026-12-31 (bail.pdf).' }],
      planning: [{ content: 'Rappel créé.' }],
    });
    await expect(run()).resolves.toBe('Rappel programmé.');
    expect(calls.map((entry) => entry.role)).toEqual(['orchestrator', 'documents', 'orchestrator', 'planning', 'orchestrator']);
    // Le spécialiste ne voit que la consigne, pas la conversation.
    expect(calls[1]!.messages.slice(1)).toEqual([{ role: 'user', content: 'Date de fin du bail ?' }]);
  });

  it('signale une délégation invalide au modèle sans lancer de spécialiste', async () => {
    const { run, steps, calls } = setup({
      orchestrator: [{ tool_calls: [call('ask_garage', { task: 'x' })] }, { content: 'Je ne sais pas faire.' }],
    });
    await expect(run()).resolves.toBe('Je ne sais pas faire.');
    expect(steps).toEqual([expect.objectContaining({ kind: 'tool_result', tool: 'ask_garage', error: 'Outil inconnu : ask_garage' })]);
    expect(calls.every((entry) => entry.role === 'orchestrator')).toBe(true);
  });

  it('propage une erreur fatale d’un spécialiste après la fin des autres', async () => {
    const getAgenda = vi.fn(async () => ({ items: [], calendarConnected: true }));
    const { run, steps } = setup({
      orchestrator: [{ tool_calls: [call('ask_documents', { task: 'a' }), call('ask_planning', { task: 'b' })] }],
      documents: [searchCall],
      planning: [{ tool_calls: [call('get_agenda', { from: '2026-10-19', to: '2026-10-25' })] }, { content: 'ok' }],
    }, {
      exactSearch: async () => { throw new TaskError('401 Token de tâche invalide', false, true); },
      getAgenda,
    });
    await expect(run()).rejects.toThrow('401');
    expect(steps).toContainEqual(expect.objectContaining({ kind: 'delegation_result', specialist: 'planning', answer: 'ok' }));
  });

  it("borne le nombre de tours de délégation", async () => {
    const replies = Array.from({ length: MAX_ORCHESTRATOR_ITERATIONS }, () => ({ tool_calls: [call('ask_home', { task: 'état ?' })] }));
    const { run, calls } = setup({
      orchestrator: [...replies, { content: 'Fin.' }],
      home: Array.from({ length: MAX_ORCHESTRATOR_ITERATIONS }, () => ({ content: 'rien' })),
    });
    await expect(run()).resolves.toBe('Fin.');
    expect(calls.filter((entry) => entry.role === 'orchestrator')).toHaveLength(MAX_ORCHESTRATOR_ITERATIONS + 1);
  });
});

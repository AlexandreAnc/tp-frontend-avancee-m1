/**
 * Banc d'essai de la boucle multi-agents : un compte fictif (documents, maison, agenda, routines) derrière une
 * fausse API, un vrai modèle Ollama, et les contrôles communs à tous les scénarios.
 * Sert à l'évaluation (`eval/run.ts`) et à la génération des exemples d'entraînement (`finetune/generate.ts`).
 */
import type { AgendaItem, AgentStep, HomeState, ProposedAction } from '@app/shared';
import type { ApiClient } from '../src/api/client';
import { LlmClient, type ModelCheck } from '../src/llm/ollama';
import { runOrchestrator } from '../src/loop/orchestrator';

export interface FakeDocument {
  id: string;
  name: string;
  type: string;
  summary: string;
  text: string;
  path?: string;
}

export interface FakeAccount {
  documents: FakeDocument[];
  home: HomeState;
  agenda: AgendaItem[];
  routines: { id: string; name: string; enabled: boolean; steps: string[] }[];
}

export interface Run {
  answer: string;
  steps: AgentStep[];
  actions: ProposedAction[];
  /** Appels à l'API, avec leurs arguments utiles (`runRoutine:<id>`…). */
  calls: string[];
  /** Identifiants réellement renvoyés par les outils : tout autre UUID cité est inventé. */
  knownIds: Set<string>;
}

export interface Scenario {
  name: string;
  question: string;
  account: FakeAccount;
  now: Date;
  check: (run: Run) => string[];
}

/** Un appel au modèle pendant un scénario : la matière d'un exemple d'entraînement. */
export interface LlmExchange {
  request: Parameters<LlmClient['chat']>[0];
  response: Awaited<ReturnType<LlmClient['chat']>>['message'];
}

export interface ModelConfig {
  OLLAMA_URL: string;
  CHAT_MODEL: string;
  EMBED_MODEL: string;
  CHAT_CONTEXT?: number;
}

const embeddingCache = new Map<string, number[]>();

async function embedAll(llm: LlmClient, texts: string[]): Promise<number[][]> {
  const missing = texts.filter((text) => !embeddingCache.has(text));
  if (missing.length) (await llm.embed(missing)).forEach((vector, index) => embeddingCache.set(missing[index]!, vector));
  return texts.map((text) => embeddingCache.get(text)!);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index]! * b[index]!;
    na += a[index]! ** 2;
    nb += b[index]! ** 2;
  }
  return dot / Math.sqrt(na * nb);
}

function fakeApi(account: FakeAccount, run: Run, llm: LlmClient): ApiClient {
  const record = (call: string) => run.calls.push(call);
  const documentById = (id: string) => account.documents.find((document) => document.id === id);
  const api = {
    listFiles: async () => {
      record('listFiles');
      return { files: account.documents.map((document) => ({
        id: document.id, name: document.name, mimeType: 'application/pdf', sizeBytes: 1000 + document.text.length, status: 'ready' as const,
        documentType: document.type, summary: document.summary, path: document.path ?? '', createdAt: '2026-11-01T10:00:00Z',
      })) };
    },
    readFile: async (fileId: string) => {
      record('readFile');
      const document = documentById(fileId);
      if (!document) throw new Error('API /files : 404 Fichier introuvable');
      return { fileId, name: document.name, text: document.text, offset: 0, totalLength: document.text.length };
    },
    exactSearch: async ({ query }: { query: string }) => {
      record('exactSearch');
      const needle = query.toLowerCase();
      return { results: account.documents
        .filter((document) => `${document.name} ${document.text}`.toLowerCase().includes(needle))
        .map((document) => ({ fileId: document.id, fileName: document.name, snippet: document.text.slice(0, 200) })) };
    },
    // Vraie recherche par le sens : embeddings bge-m3 des documents, comparés à celui de la question.
    semanticSearch: async ({ embedding, limit }: { embedding: number[]; limit: number }) => {
      record('semanticSearch');
      const vectors = await embedAll(llm, account.documents.map((document) => `${document.name}\n${document.text}`));
      return { results: account.documents
        .map((document, index) => ({ fileId: document.id, fileName: document.name, chunkIndex: 0, content: document.text, score: cosine(embedding, vectors[index]!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(limit, 4)) };
    },
    getHome: async () => (record('getHome'), account.home),
    getAgenda: async ({ from, to }: { from: string; to: string }) => {
      record('getAgenda');
      return { calendarConnected: true, items: account.agenda.filter((item) => item.start.slice(0, 10) >= from.slice(0, 10) && item.start.slice(0, 10) <= to.slice(0, 10)) };
    },
    listRoutines: async () => (record('listRoutines'), { routines: account.routines }),
    runRoutine: async (routineId: string) => {
      record(`runRoutine:${routineId}`);
      const routine = account.routines.find((candidate) => candidate.id === routineId);
      if (!routine) throw new Error('API /routines : 404 Routine introuvable');
      return { status: 'success' as const, steps: routine.steps.map((label) => ({ label, status: 'done', error: null })) };
    },
    requestAction: async (action: ProposedAction) => {
      record(`requestAction:${action.type}`);
      run.actions.push(action);
      const id = crypto.randomUUID();
      run.knownIds.add(id);
      return action.type === 'google_calendar.create_event'
        ? { status: 'pending' as const, actionId: id, expiresAt: '2026-12-31T00:00:00Z' }
        : { status: 'executed' as const, activityId: id, result: {} };
    },
  };
  return api as unknown as ApiClient;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Contrôles valables pour toute réponse à l'utilisateur. */
export function genericFailures(run: Run): string[] {
  const invented = (run.answer.match(UUID) ?? []).filter((id) => !run.knownIds.has(id.toLowerCase()));
  return [
    ...invented.map((id) => `identifiant inventé : ${id}`),
    ...(/\b(okay|let me|let's|the user)\b/i.test(run.answer) ? ['raisonnement interne ou anglais dans la réponse'] : []),
    ...(run.answer.trim() ? [] : ['réponse vide']),
  ];
}

export const delegatedTo = (run: Run): string[] => run.steps
  .filter((step): step is Extract<AgentStep, { kind: 'delegation' }> => step.kind === 'delegation')
  .map((step) => step.specialist);

/** Joue un scénario ; `onExchange` reçoit chaque appel au modèle (génération d'exemples). */
export async function runScenario(
  scenario: Scenario,
  config: ModelConfig,
  capabilities: ModelCheck,
  onExchange?: (exchange: LlmExchange) => void,
): Promise<{ run: Run; failures: string[]; seconds: number }> {
  const run: Run = { answer: '', steps: [], actions: [], calls: [], knownIds: new Set(scenario.account.documents.map((document) => document.id)) };
  for (const routine of scenario.account.routines) run.knownIds.add(routine.id);
  const signal = AbortSignal.timeout(300_000);
  const llm = new LlmClient(config, signal, capabilities.supportsThinking, capabilities.supportsVision);
  if (onExchange) {
    const chat = llm.chat.bind(llm);
    llm.chat = async (request) => {
      // Copie au moment de l'appel : la boucle ajoute ensuite des messages au même tableau.
      const snapshot = { ...request, messages: request.messages.map((message) => ({ ...message })) };
      const result = await chat(request);
      onExchange({ request: snapshot, response: result.message });
      return result;
    };
  }
  const begin = Date.now();
  try {
    run.answer = await runOrchestrator({
      history: [{ role: 'user', content: scenario.question }],
      context: { api: fakeApi(scenario.account, run, llm), llm, timezone: 'Europe/Paris' },
      emitStep: async (step) => void run.steps.push(step),
      signal,
      now: scenario.now,
    });
  } catch (error) {
    return { run, failures: [`erreur : ${error instanceof Error ? error.message : String(error)}`], seconds: (Date.now() - begin) / 1000 };
  }
  return { run, failures: [...scenario.check(run), ...genericFailures(run)], seconds: (Date.now() - begin) / 1000 };
}

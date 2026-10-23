/**
 * Génère les exemples d'entraînement par distillation : un modèle « professeur » joue des scénarios du panel,
 * et seules les parties qui passent tous les contrôles deviennent des exemples (un par appel au modèle).
 *
 *   TEACHER=gemma4:26b COUNT=600 pnpm --filter agent finetune:generate
 *
 * Sortie : `$FINETUNE_DIR/data/{train,valid}.jsonl`, au format chat + outils de mlx-lm (`messages`, `tools`).
 * Reprise : chaque scénario joué est noté dans `$FINETUNE_DIR/runs.jsonl` dès qu'il se termine ; relancer la même
 * commande (même SEED, même COUNT) reprend là où on s'était arrêté.
 * Le raisonnement du professeur est retiré : le modèle entraîné répond directement (pas de phase de réflexion).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkModels } from '../src/llm/ollama';
import { runScenario, type LlmExchange, type ModelConfig } from '../eval/harness';
import { generateScenarios } from '../eval/scenarios';

const TEACHER = process.env.TEACHER ?? 'gemma4:26b';
const COUNT = Number(process.env.COUNT ?? 600);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const SEED = Number(process.env.SEED ?? 1);
const ROOT = process.env.FINETUNE_DIR ?? join(homedir(), '.cache/dashia-finetune');
const OUT = join(ROOT, 'data');
const RUNS = join(ROOT, 'runs.jsonl');
const config: ModelConfig = { OLLAMA_URL: process.env.OLLAMA_URL ?? 'http://localhost:11434', CHAT_MODEL: TEACHER, EMBED_MODEL: 'bge-m3' };

type TrainingMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: { type: 'function'; function: { name: string; arguments: unknown } }[] }
  | { role: 'tool'; content: string };

function toTrainingMessage(message: LlmExchange['response']): TrainingMessage {
  if (message.role === 'assistant') {
    const calls = message.tool_calls?.map((call) => ({ type: 'function' as const, function: { name: call.function.name, arguments: call.function.arguments } }));
    return { role: 'assistant', content: message.content ?? '', ...(calls?.length ? { tool_calls: calls } : {}) };
  }
  if (message.role === 'tool') return { role: 'tool', content: message.content };
  return { role: message.role as 'system' | 'user', content: message.content };
}

/** Un exemple : tout le contexte de l'appel, et la réponse du professeur comme cible (dernier message). */
function toExample(exchange: LlmExchange) {
  const target = toTrainingMessage(exchange.response);
  if (target.role !== 'assistant' || (!target.content.trim() && !target.tool_calls)) return null;
  return {
    messages: [...exchange.request.messages.map(toTrainingMessage), target],
    ...(exchange.request.tools?.length ? { tools: exchange.request.tools } : {}),
  };
}

type Example = NonNullable<ReturnType<typeof toExample>>;
interface RunRecord { key: string; intent: string; failures: string[]; examples: Example[] }

async function main() {
  const scenarios = generateScenarios(SEED, COUNT, 'train');
  const capabilities = await checkModels(config);
  mkdirSync(ROOT, { recursive: true });
  const records: RunRecord[] = existsSync(RUNS)
    ? readFileSync(RUNS, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as RunRecord)
    : [];
  const done = new Set(records.map((record) => record.key));
  const keyOf = (index: number) => `${TEACHER}:${SEED}:${index}`;
  const queue = scenarios.map((scenario, index) => ({ scenario, key: keyOf(index) })).filter(({ key }) => !done.has(key));
  console.info(`Professeur : ${TEACHER} · ${scenarios.length} scénarios d'entraînement (${scenarios.length - queue.length} déjà joués) · ${CONCURRENCY} en parallèle`);

  const started = Date.now();
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const exchanges: LlmExchange[] = [];
      const { failures } = await runScenario(item.scenario, config, capabilities, (exchange) => exchanges.push(exchange));
      const record: RunRecord = { key: item.key, intent: item.scenario.name, failures, examples: failures.length ? [] : exchanges.map(toExample).filter((example) => example !== null) };
      records.push(record);
      appendFileSync(RUNS, `${JSON.stringify(record)}\n`);
      if (records.length % 20 === 0 || queue.length === 0) {
        const minutes = (Date.now() - started) / 60_000;
        console.info(`  ${records.length}/${scenarios.length} joués · ${records.filter((entry) => !entry.failures.length).length} gardés · ${minutes.toFixed(1)} min`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mine = records.filter((record) => record.key.startsWith(`${TEACHER}:${SEED}:`));
  const kept = mine.filter((record) => record.failures.length === 0);
  const rejected = new Map<string, number>();
  for (const record of mine.filter((entry) => entry.failures.length)) rejected.set(record.intent, (rejected.get(record.intent) ?? 0) + 1);

  // Validation : un scénario entier sur dix, pour ne pas couper une conversation entre les deux fichiers.
  const train = kept.filter((_, index) => index % 10 !== 9).flatMap((entry) => entry.examples);
  const valid = kept.filter((_, index) => index % 10 === 9).flatMap((entry) => entry.examples);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'train.jsonl'), train.map((example) => JSON.stringify(example)).join('\n') + '\n');
  writeFileSync(join(OUT, 'valid.jsonl'), valid.map((example) => JSON.stringify(example)).join('\n') + '\n');

  console.info(`\n${kept.length}/${mine.length} scénarios réussis par le professeur → ${train.length} exemples d'entraînement, ${valid.length} de validation (${OUT})`);
  if (rejected.size) {
    console.info('Écartés (échec du professeur) :');
    for (const [intent, count] of [...rejected].sort((a, b) => b[1] - a[1])) console.info(`  ${count}  ${intent}`);
  }
}

await main();

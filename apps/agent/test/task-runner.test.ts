import type { AgentToServerMessage, TaskAssignMessage } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../src/config';
import type * as OllamaModule from '../src/llm/ollama';
import { TaskRunner } from '../src/tasks/runner';
import type { TaskContext } from '../src/tasks/context';
import { TaskCancelledError, TaskError } from '../src/tasks/errors';

const replyToChat = vi.hoisted(() => vi.fn());
const indexFile = vi.hoisted(() => vi.fn());
const checkModels = vi.hoisted(() => vi.fn());
vi.mock('../src/tasks/chat-reply', () => ({ replyToChat }));
vi.mock('../src/tasks/index-file', () => ({ indexFile }));
vi.mock('../src/llm/ollama', async (importOriginal) => ({ ...await importOriginal<typeof OllamaModule>(), checkModels }));

const config = { SERVER_URL: 'https://dashia.test', OLLAMA_URL: 'http://localhost:11434', CHAT_MODEL: 'test', EMBED_MODEL: 'bge-m3', AGENT_TIMEZONE: 'Europe/Paris' } as AgentConfig;
const chatTask = (taskId: string, payload: unknown = {
  conversationId: '849fea72-3abd-4321-9ff7-00a5d3ee67cf',
  messageId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
  history: [{ role: 'user', content: 'Bonjour' }],
}): TaskAssignMessage => ({ type: 'task.assign', taskId, taskType: 'chat.reply', token: 'token', payload });

function setup() {
  const sent: AgentToServerMessage[] = [];
  const runner = new TaskRunner(config, { supportsThinking: false, supportsVision: false }, (message) => void sent.push(message));
  const settled = () => vi.waitFor(() => expect(runner.size).toBe(0));
  return { runner, sent, settled };
}

/** Tâche suspendue jusqu'à `finish`, pour observer le runner pendant l'exécution. */
function pending() {
  let finish!: (value: unknown) => void;
  const promise = new Promise((resolve) => { finish = resolve; });
  return { promise, finish };
}

describe('TaskRunner', () => {
  beforeEach(() => {
    replyToChat.mockReset();
    indexFile.mockReset();
    for (const level of ['info', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('renvoie le résultat d’une tâche terminée', async () => {
    replyToChat.mockResolvedValueOnce({ content: 'Bonjour !' });
    const { runner, sent, settled } = setup();
    runner.run(chatTask('t1'));
    await settled();
    expect(sent).toEqual([{ type: 'task.completed', taskId: 't1', result: { content: 'Bonjour !' } }]);
  });

  it('refuse un payload invalide sans le réessayer', async () => {
    const { runner, sent, settled } = setup();
    runner.run(chatTask('t2', { conversationId: 'pas-un-uuid' }));
    await settled();
    expect(sent).toEqual([{ type: 'task.failed', taskId: 't2', error: 'Payload chat.reply invalide', retryable: false }]);
    expect(replyToChat).not.toHaveBeenCalled();
  });

  it('transmet la possibilité de réessayer d’une erreur typée, et réessaie une erreur inconnue', async () => {
    replyToChat.mockRejectedValueOnce(new TaskError('404', false)).mockRejectedValueOnce(new Error('bug'));
    const { runner, sent, settled } = setup();
    runner.run(chatTask('t3'));
    runner.run(chatTask('t4'));
    await settled();
    expect(sent).toContainEqual({ type: 'task.failed', taskId: 't3', error: '404', retryable: false });
    expect(sent).toContainEqual({ type: 'task.failed', taskId: 't4', error: 'bug', retryable: true });
  });

  it('ignore une tâche déjà en cours et ne renvoie rien pour une tâche annulée', async () => {
    let finish!: (value: unknown) => void;
    replyToChat.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { runner, sent } = setup();
    runner.run(chatTask('t5'));
    runner.run(chatTask('t5'));
    expect(runner.size).toBe(1);
    expect(replyToChat).toHaveBeenCalledTimes(1);

    runner.cancel('t5');
    finish({ content: 'trop tard' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([]);
  });

  it('oriente chaque type de tâche vers son implémentation avec un contexte complet', async () => {
    indexFile.mockResolvedValueOnce({ chunkCount: 3 });
    const { runner, sent, settled } = setup();
    const fileId = '849fea72-3abd-4321-9ff7-00a5d3ee67cf';
    runner.run({ type: 'task.assign', taskId: 'i1', taskType: 'file.index', token: 'tok', payload: { fileId, fileName: 'a.pdf', mimeType: 'application/pdf' } });
    await settled();
    expect(sent).toEqual([{ type: 'task.completed', taskId: 'i1', result: { chunkCount: 3 } }]);
    const [payload, context] = indexFile.mock.calls[0] as [unknown, TaskContext];
    expect(payload).toEqual({ fileId, fileName: 'a.pdf', mimeType: 'application/pdf' });
    expect(context).toMatchObject({ taskId: 'i1', timezone: 'Europe/Paris' });
    expect(context.llm.embedModel).toBe('bge-m3');
    expect(replyToChat).not.toHaveBeenCalled();
  });

  it('publie les étapes de la tâche, puis refuse d’en publier après l’annulation', async () => {
    const { promise, finish } = pending();
    let context!: TaskContext;
    replyToChat.mockImplementationOnce((_payload: unknown, taskContext: TaskContext) => {
      context = taskContext;
      return promise;
    });
    const { runner, sent } = setup();
    runner.run(chatTask('s1'));
    await vi.waitFor(() => expect(context).toBeDefined());

    await context.emitStep({ kind: 'thinking', text: 'Je cherche.' });
    expect(sent).toEqual([{ type: 'task.step', taskId: 's1', step: { kind: 'thinking', text: 'Je cherche.' } }]);

    runner.cancel('s1');
    expect(context.signal.aborted).toBe(true);
    expect(context.signal.reason).toBeInstanceOf(TaskCancelledError);
    await expect(context.emitStep({ kind: 'thinking', text: 'trop tard' })).rejects.toBeInstanceOf(TaskCancelledError);
    finish({ content: 'x' });
    expect(sent).toHaveLength(1);
  });

  it('ne renvoie pas l’échec d’une tâche annulée', async () => {
    let rejected = false;
    replyToChat.mockImplementationOnce((_payload: unknown, context: TaskContext) => new Promise((_resolve, reject) => {
      context.signal.addEventListener('abort', () => {
        rejected = true;
        reject(context.signal.reason as Error);
      });
    }));
    const { runner, sent } = setup();
    runner.run(chatTask('c1'));
    await vi.waitFor(() => expect(replyToChat).toHaveBeenCalled());
    runner.cancelAll();
    expect(runner.size).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejected).toBe(true);
    expect(sent).toEqual([]);
  });

  it('cancelAll abandonne toutes les tâches en cours', async () => {
    const signals: AbortSignal[] = [];
    replyToChat.mockImplementation((_payload: unknown, context: TaskContext) => {
      signals.push(context.signal);
      return pending().promise;
    });
    const { runner } = setup();
    runner.run(chatTask('a'));
    runner.run(chatTask('b'));
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    runner.cancelAll();
    expect(runner.size).toBe(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('garde la trace d’une tâche annulée puis réattribuée à cette machine', async () => {
    const first = pending();
    const second = pending();
    replyToChat.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { runner, sent, settled } = setup();
    runner.run(chatTask('r1'));
    runner.cancel('r1');
    runner.run(chatTask('r1'));

    // La première exécution se termine (ignorée) : la seconde doit rester suivie, et donc dédoublonnée et annulable.
    first.finish({ content: 'ancienne' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runner.size).toBe(1);
    runner.run(chatTask('r1'));
    expect(replyToChat).toHaveBeenCalledTimes(2);

    second.finish({ content: 'nouvelle' });
    await settled();
    expect(sent).toEqual([{ type: 'task.completed', taskId: 'r1', result: { content: 'nouvelle' } }]);
  });

  it('vérifie puis applique un nouveau modèle de chat aux tâches suivantes', async () => {
    checkModels.mockResolvedValueOnce({ supportsThinking: true, supportsVision: true });
    let context!: TaskContext;
    replyToChat.mockImplementationOnce(async (_payload: unknown, taskContext: TaskContext) => {
      context = taskContext;
      return { content: 'ok' };
    });
    const runnerConfig = { ...config };
    const sent: AgentToServerMessage[] = [];
    const runner = new TaskRunner(runnerConfig, { supportsThinking: false, supportsVision: false }, (message) => void sent.push(message));

    await runner.switchChatModel('gemma3:27b');
    expect(checkModels).toHaveBeenCalledWith(expect.objectContaining({ CHAT_MODEL: 'gemma3:27b', EMBED_MODEL: 'bge-m3' }));
    expect(sent).toEqual([{ type: 'config.applied', chatModel: 'gemma3:27b' }]);
    // La configuration partagée change aussi : le prochain `hello` annonce le nouveau modèle.
    expect(runnerConfig.CHAT_MODEL).toBe('gemma3:27b');

    runner.run(chatTask('m1'));
    await vi.waitFor(() => expect(runner.size).toBe(0));
    expect(context.llm).toMatchObject({ chatModel: 'gemma3:27b', supportsThinking: true, supportsVision: true });
  });

  it('garde l’ancien modèle et explique pourquoi quand le nouveau est inutilisable', async () => {
    checkModels.mockRejectedValueOnce(new Error('Le modèle llama2 ne gère pas les outils (tool calling)'));
    const runnerConfig = { ...config };
    const sent: AgentToServerMessage[] = [];
    const runner = new TaskRunner(runnerConfig, { supportsThinking: false, supportsVision: false }, (message) => void sent.push(message));
    await runner.switchChatModel('llama2');
    expect(sent).toEqual([{ type: 'config.applied', chatModel: 'llama2', error: 'Le modèle llama2 ne gère pas les outils (tool calling)' }]);
    expect(runnerConfig.CHAT_MODEL).toBe('test');
  });

  it('transmet le texte d’un rejet qui n’est pas une Error', async () => {
    replyToChat.mockRejectedValueOnce('délai dépassé');
    const { runner, sent, settled } = setup();
    runner.run(chatTask('e1'));
    await settled();
    expect(sent).toEqual([{ type: 'task.failed', taskId: 'e1', error: 'délai dépassé', retryable: true }]);
  });
});

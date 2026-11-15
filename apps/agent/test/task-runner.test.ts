import type { AgentToServerMessage, TaskAssignMessage } from '@app/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../src/config';
import { TaskRunner } from '../src/tasks/runner';
import { TaskError } from '../src/tasks/errors';

const replyToChat = vi.hoisted(() => vi.fn());
vi.mock('../src/tasks/chat-reply', () => ({ replyToChat }));

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

describe('TaskRunner', () => {
  beforeEach(() => replyToChat.mockReset());

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
});

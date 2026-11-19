import { loadConfig } from './config';
import { ServerConnection } from './connection/client';
import { checkModels, listInstalledModels } from './llm/ollama';
import { TaskRunner } from './tasks/runner';

const config = loadConfig();
const capabilities = await checkModels(config);
const features = [capabilities.supportsThinking && 'raisonnement', capabilities.supportsVision && 'vision'].filter(Boolean).join(', ');
console.info(`[agent] modèles prêts (chat : ${config.CHAT_MODEL}${features ? ` — ${features}` : ''} ; embeddings : ${config.EMBED_MODEL})`);

// `runner` et `connection` se référencent : le runner envoie ses résultats par la connexion.
const runner: TaskRunner = new TaskRunner(config, capabilities, (message) => connection.send(message), () => connection.acceptsDrafts);
const connection: ServerConnection = new ServerConnection(config, {
  onMessage: (message) => {
    if (message.type === 'task.assign') runner.run(message);
    else if (message.type === 'task.cancel') runner.cancel(message.taskId);
    else void runner.switchChatModel(message.chatModel);
  },
  listModels: () => listInstalledModels(config.OLLAMA_URL),
  onDisconnect: () => runner.cancelAll(),
  onFatalError: () => {
    process.exitCode = 1;
  },
});

connection.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.info('[agent] arrêt');
    runner.cancelAll();
    connection.stop();
  });
}

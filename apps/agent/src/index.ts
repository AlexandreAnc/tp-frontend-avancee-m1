import { loadConfig } from './config';
import { ServerConnection } from './connection/client';
import { checkModels, listInstalledModels } from './llm/ollama';
import { TaskRunner } from './tasks/runner';

const config = loadConfig();
const capabilities = await checkModels(config);
const features = [capabilities.supportsThinking && 'raisonnement', capabilities.supportsVision && 'vision'].filter(Boolean).join(', ');
console.info(`[agent] modèles prêts (chat : ${config.CHAT_MODEL}${features ? ` — ${features}` : ''} ; embeddings : ${config.EMBED_MODEL})`);

// `runner` et `connection` se référencent : le runner envoie ses résultats par la connexion.
const runner: TaskRunner = new TaskRunner(config, capabilities, (message) => connection.send(message));
const connection: ServerConnection = new ServerConnection(config, {
  onMessage: (message) => {
    if (message.type === 'task.assign') runner.run(message);
    else if (message.type === 'task.cancel') runner.cancel(message.taskId);
    else void switchChatModel(message.chatModel);
  },
  listModels: () => listInstalledModels(config.OLLAMA_URL),
  onDisconnect: () => runner.cancelAll(),
  onFatalError: () => {
    process.exitCode = 1;
  },
});

/** Changement de modèle demandé depuis l'app : vérifié avant d'être appliqué. */
async function switchChatModel(chatModel: string) {
  try {
    runner.setCapabilities(await checkModels({ ...config, CHAT_MODEL: chatModel }));
    config.CHAT_MODEL = chatModel;
    console.info(`[agent] modèle de chat : ${chatModel}`);
    connection.send({ type: 'config.applied', chatModel });
  } catch (error) {
    connection.send({ type: 'config.applied', chatModel, error: error instanceof Error ? error.message : String(error) });
  }
}

connection.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.info('[agent] arrêt');
    runner.cancelAll();
    connection.stop();
  });
}
